"""HTTP routes. Kept thin: validation and wiring only, the work happens in the other modules."""

from __future__ import annotations

import json
import logging
import os
import platform
import string
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from . import __version__, ios, mvt, results, security, updates
from .config import (
    MAX_BROWSE_ENTRIES,
    MAX_PASSWORD_LENGTH,
    MAX_PATH_LENGTH,
    SSE_KEEPALIVE_SECONDS,
    STATIC_DIR,
    Settings,
)
from .jobs import Job, JobRegistry, run_command

log = logging.getLogger(__name__)

WINDOWS_DRIVES = "::drives"
RESTART_DELAY_SECONDS = 0.5
# Bump when the data-handling text shown before consent changes, so saved records say which text was agreed to.
CONSENT_POLICY_VERSION = 1


class UserFacingError(Exception):
    """A request the user can fix; the message is shown to them."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _json_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise UserFacingError("The request was not understood.")
    return body


def _string(body: dict[str, Any], key: str, max_length: int, default: str = "") -> str:
    value = body.get(key, default)
    if value is None:
        return default
    if not isinstance(value, str) or len(value) > max_length or "\x00" in value:
        raise UserFacingError(f"The value for {key} is not valid.")
    return value


def create_app(settings: Settings, registry: JobRegistry | None = None, restart_args: list[str] | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    jobs = registry or JobRegistry()
    cases_dir = settings.cases_dir

    # ------------------------------------------------------------ cross-cutting

    @app.before_request
    def guard() -> Response | None:
        reason = security.rejection_reason(request)
        if reason:
            log.warning("request refused", extra={"path": request.path, "reason": reason})
            return _error(reason, 403)
        return None

    app.after_request(security.add_security_headers)

    def _error(message: str, status: int) -> Response:
        response = jsonify({"error": message})
        response.status_code = status
        return response

    @app.errorhandler(UserFacingError)
    def bad_request(exc: UserFacingError) -> Response:
        return _error(exc.message, exc.status)

    @app.errorhandler(HTTPException)
    def http_error(exc: HTTPException) -> Response:
        return _error(exc.description or exc.name, exc.code or 500)

    @app.errorhandler(Exception)
    def unexpected(exc: Exception) -> Response:
        log.exception("unhandled error", extra={"path": request.path})
        return _error("Something went wrong inside PhoneForensics. Please try again.", 500)

    def _job(job_id: str) -> Job:
        job = jobs.get(job_id)
        if job is None:
            raise UserFacingError("This task is no longer running.", 404)
        return job

    def _case(case_id: str) -> Path:
        path = results.resolve_case(cases_dir, case_id)
        if path is None:
            raise UserFacingError("That check could not be found.", 404)
        return path

    # ------------------------------------------------------------ pages

    @app.get("/")
    def index() -> Response:
        return send_from_directory(STATIC_DIR, "index.html")

    @app.get("/static/<path:name>")
    def static_files(name: str) -> Response:
        return send_from_directory(STATIC_DIR, name)

    # ------------------------------------------------------------ status & discovery

    @app.get("/api/status")
    def status() -> Response:
        return jsonify(
            {
                "version": __version__,
                "mvt": mvt.installed_version(),
                "python": platform.python_version(),
                "platform": platform.system(),
                "iocs": mvt.indicator_status(),
                "cases_dir": str(cases_dir),
                "home": str(Path.home()),
                "support_url": settings.support_url,
            }
        )

    @app.get("/api/ios-backups")
    def ios_backups() -> Response:
        return jsonify(ios.find_backups(Path.home()))

    @app.get("/api/browse")
    def browse() -> Response:
        raw = request.args.get("path", "")[:MAX_PATH_LENGTH] or str(Path.home())
        is_windows = platform.system() == "Windows"
        if raw == WINDOWS_DRIVES and is_windows:
            drives = [f"{d}:\\" for d in string.ascii_uppercase if Path(f"{d}:\\").exists()]
            return jsonify(
                {
                    "path": WINDOWS_DRIVES,
                    "parent": None,
                    "entries": [{"name": d, "path": d, "dir": True} for d in drives],
                }
            )
        path = Path(raw).expanduser()
        if not path.exists():
            raise UserFacingError("That location doesn't exist.", 404)
        if path.is_file():
            path = path.parent
        entries = []
        try:
            for child in sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                if child.name.startswith("."):
                    continue
                try:
                    entries.append({"name": child.name, "path": str(child), "dir": child.is_dir()})
                except OSError:
                    continue
        except PermissionError as exc:
            raise UserFacingError("This computer does not allow PhoneForensics to open that folder.", 403) from exc
        parent = str(path.parent) if path.parent != path else (WINDOWS_DRIVES if is_windows else None)
        backup = ios.is_backup(path)
        return jsonify(
            {
                "path": str(path),
                "parent": parent,
                "entries": entries[:MAX_BROWSE_ENTRIES],
                "is_ios_backup": backup,
                "ios_backup": ios.describe(path) if backup else None,
            }
        )

    # ------------------------------------------------------------ jobs

    @app.post("/api/iocs/update")
    def update_indicators() -> Response:
        def worker(job: Job) -> None:
            code = run_command(job, mvt.download_indicators_command())
            job.summary = dict(mvt.indicator_status())
            job.finish("done" if code == 0 else "failed", None if code == 0 else "Could not download the lists.")

        return jsonify(jobs.start("iocs", "Updating spyware lists", None, worker).to_dict())

    @app.post("/api/scan")
    def scan() -> Response:
        body = _json_body()
        scan_type = _string(body, "type", 32)
        target = _string(body, "path", MAX_PATH_LENGTH).strip()
        label = results.sanitise_label(_string(body, "label", 200))
        password = _string(body, "password", MAX_PASSWORD_LENGTH) or None
        fast = body.get("fast") is True
        if body.get("consent") is not True:
            raise UserFacingError("Please confirm the phone owner has agreed to this check.")
        if scan_type not in mvt.SCAN_TYPES:
            raise UserFacingError("Unknown kind of check.")
        if not target or not Path(target).exists():
            raise UserFacingError("Please choose a file or folder that exists.")
        if jobs.any_running(["scan", "update"]):
            raise UserFacingError("Another check or update is already running. Please wait for it to finish.", 409)

        cases_dir.mkdir(parents=True, exist_ok=True)
        case_dir = results.new_case_dir(cases_dir, label)
        now = datetime.now().isoformat()
        results.write_case_meta(
            case_dir,
            {
                "label": label,
                "type": scan_type,
                "source": target,
                "created": now,
                # Record of the informed-consent confirmation required by MVT License §3.0.
                "consent": {"confirmed": True, "confirmed_at": now, "policy_version": CONSENT_POLICY_VERSION},
            },
        )

        def worker(job: Job) -> None:
            source = target
            if scan_type == "ios-backup" and password:
                job.log("Unlocking the encrypted backup. This can take a while...")
                decrypted = case_dir / mvt.DECRYPTED_DIR_NAME
                code = run_command(
                    job,
                    mvt.decrypt_command(target, decrypted),
                    env={mvt.IOS_PASSWORD_ENV: password},
                    secrets=[password],
                )
                if code != 0:
                    results.remove_decrypted_copy(case_dir, mvt.DECRYPTED_DIR_NAME)
                    failed = results.summarise(case_dir, completed=False)
                    results.save_summary(case_dir, failed)
                    job.summary = dict(failed)
                    job.finish("failed", "Could not unlock the backup. Please check the password.")
                    return
                source = str(decrypted)
            cmd = mvt.scan_command(scan_type, source, case_dir, fast=fast, password=password, extra_iocs=[])
            try:
                code = run_command(job, cmd, secrets=[password] if password else [])
            finally:
                results.remove_decrypted_copy(case_dir, mvt.DECRYPTED_DIR_NAME)
            summary = results.summarise(case_dir, completed=code == 0)
            results.save_summary(case_dir, summary)
            job.summary = dict(summary)
            job.finish("done" if code == 0 else "failed", None if code == 0 else "MVT stopped before finishing.")

        return jsonify(jobs.start("scan", label, case_dir, worker).to_dict())

    @app.get("/api/jobs/<job_id>")
    def job_info(job_id: str) -> Response:
        return jsonify(_job(job_id).to_dict())

    @app.post("/api/jobs/<job_id>/cancel")
    def job_cancel(job_id: str) -> Response:
        _job(job_id).cancel()
        return jsonify({"ok": True})

    @app.get("/api/jobs/<job_id>/stream")
    def job_stream(job_id: str) -> Response:
        job = _job(job_id)

        def events() -> Iterator[str]:
            for lines, done in job.stream(SSE_KEEPALIVE_SECONDS):
                for line in lines:
                    yield f"data: {json.dumps({'line': line})}\n\n"
                if not lines and not done:
                    yield ": keepalive\n\n"
                if done:
                    yield f"event: done\ndata: {json.dumps(job.to_dict(), default=str)}\n\n"

        return Response(events(), mimetype="text/event-stream", headers={"X-Accel-Buffering": "no"})

    # ------------------------------------------------------------ saved checks

    @app.get("/api/cases")
    def list_cases() -> Response:
        return jsonify(results.list_cases(cases_dir))

    @app.get("/api/cases/<case_id>")
    def get_case(case_id: str) -> Response:
        path = _case(case_id)
        return jsonify(
            {"id": case_id, **results.read_case_meta(path), "summary": results.load_summary(path), "path": str(path)}
        )

    @app.get("/api/cases/<case_id>/files/<name>")
    def case_file(case_id: str, name: str) -> Response:
        return send_from_directory(_case(case_id), name, as_attachment=True)

    @app.post("/api/cases/<case_id>/delete")
    def delete_case(case_id: str) -> Response:
        path = _case(case_id)
        if any(j.case_dir == path and j.status == "running" for j in jobs.all()):
            raise UserFacingError("This check is still running. Stop it first.", 409)
        try:
            results.delete_case(path)
        except OSError as exc:
            raise UserFacingError("Could not delete every file. Close any open files and try again.", 500) from exc
        log.info("case deleted", extra={"case_id": case_id})
        return jsonify({"ok": True})

    @app.post("/api/cases/<case_id>/open")
    def open_case_folder(case_id: str) -> Response:
        path = _case(case_id)
        try:
            # sys.platform (not platform.system()) lets mypy check each branch for the right OS.
            if sys.platform == "win32":
                os.startfile(path)  # noqa: S606 - opens a folder this app created
            else:
                opener = "open" if sys.platform == "darwin" else "xdg-open"
                subprocess.Popen([opener, str(path)])  # noqa: S603
        except OSError as exc:
            raise UserFacingError("Could not open the folder on this computer.", 500) from exc
        return jsonify({"ok": True})

    # ------------------------------------------------------------ updates

    @app.get("/api/updates")
    def check_updates() -> Response:
        return jsonify(updates.check())

    @app.post("/api/updates/apply")
    def apply_updates() -> Response:
        if jobs.any_running(["scan", "update"]):
            raise UserFacingError("Please wait for the running check to finish first.", 409)
        root = updates.git_root()
        return jsonify(
            jobs.start("update", "Updating PhoneForensics", None, lambda job: updates.apply(job, root)).to_dict()
        )

    @app.post("/api/restart")
    def restart() -> Response:
        if jobs.any_running():
            raise UserFacingError("Something is still running.", 409)

        def relaunch() -> None:
            time.sleep(RESTART_DELAY_SECONDS)
            # Start a fresh copy (it waits for this one to release the port), then exit.
            subprocess.Popen([sys.executable, "-m", "phoneforensics", *(restart_args or [])])  # noqa: S603
            os._exit(0)

        threading.Thread(target=relaunch, daemon=True).start()
        return jsonify({"ok": True})

    return app
