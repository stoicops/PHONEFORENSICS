"""Local web server that drives MVT for non-technical users.

The server only listens on 127.0.0.1 and runs MVT as a subprocess, streaming
its output to the browser and summarising the results afterwards.
"""

import argparse
import csv
import json
import os
import platform
import shutil
import string
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_from_directory

STATIC_DIR = Path(__file__).parent / "static"
DATA_DIR = Path(os.environ.get("PHONEFORENSICS_HOME", Path.home() / "PhoneForensics"))
CASES_DIR = DATA_DIR / "cases"

# Shown as "Buy me a coffee" in the app bar when set.
SUPPORT_URL = "https://buymeacoffee.com/surinder"

app = Flask(__name__, static_folder=None)
jobs = {}
jobs_lock = threading.Lock()

# What each scan type means, for both the UI and the command we build.
SCAN_TYPES = {
    "ios-backup": {"tool": "mvt-ios", "command": "check-backup"},
    "ios-fs": {"tool": "mvt-ios", "command": "check-fs"},
    "android-qf": {"tool": "mvt-android", "command": "check-androidqf"},
    "android-bugreport": {"tool": "mvt-android", "command": "check-bugreport"},
    "android-backup": {"tool": "mvt-android", "command": "check-backup"},
}


def mvt_executable(tool):
    """Find an MVT entry point, preferring the one next to this Python."""
    found = shutil.which(tool)
    if found:
        return [found]
    module = {"mvt-ios": "mvt.ios", "mvt-android": "mvt.android"}[tool]
    return [sys.executable, "-m", module]


def mvt_version():
    try:
        from importlib.metadata import version

        return version("mvt")
    except Exception:
        return None


def ioc_dir():
    """Directory where MVT stores downloaded indicators."""
    try:
        from mvt.common.indicators import MVT_INDICATORS_FOLDER

        return Path(MVT_INDICATORS_FOLDER)
    except Exception:
        return None


def ioc_status():
    folder = ioc_dir()
    files = sorted(folder.glob("*.stix2")) if folder and folder.exists() else []
    updated = max((f.stat().st_mtime for f in files), default=None)
    return {
        "count": len(files),
        "updated": datetime.fromtimestamp(updated).isoformat(timespec="minutes") if updated else None,
    }


def itunes_backup_roots():
    home = Path.home()
    roots = [
        home / "Library/Application Support/MobileSync/Backup",
        home / "AppData/Roaming/Apple Computer/MobileSync/Backup",
        home / "Apple/MobileSync/Backup",
        home / "AppData/Roaming/Apple/MobileSync/Backup",
    ]
    return [r for r in roots if r.is_dir()]


def describe_ios_backup(path):
    info = {"path": str(path), "name": path.name, "encrypted": None}
    plist = path / "Info.plist"
    manifest = path / "Manifest.plist"
    try:
        import plistlib

        if plist.exists():
            with open(plist, "rb") as handle:
                data = plistlib.load(handle)
            info["name"] = data.get("Device Name") or data.get("Display Name") or path.name
            info["model"] = data.get("Product Type")
            info["ios"] = data.get("Product Version")
            date = data.get("Last Backup Date")
            info["date"] = date.isoformat(timespec="minutes") if date else None
        if manifest.exists():
            with open(manifest, "rb") as handle:
                info["encrypted"] = bool(plistlib.load(handle).get("IsEncrypted"))
    except Exception:
        pass
    return info


# ---------------------------------------------------------------- jobs


class Job:
    def __init__(self, kind, title, case_dir):
        self.id = uuid.uuid4().hex[:12]
        self.kind = kind
        self.title = title
        self.case_dir = case_dir
        self.status = "running"
        self.lines = []
        self.started = time.time()
        self.finished = None
        self.summary = None
        self.error = None
        self.cond = threading.Condition()
        self.process = None

    def log(self, line):
        with self.cond:
            self.lines.append(line)
            self.cond.notify_all()

    def finish(self, status, error=None):
        with self.cond:
            self.status = status
            self.error = error
            self.finished = time.time()
            self.cond.notify_all()

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "status": self.status,
            "started": self.started,
            "finished": self.finished,
            "error": self.error,
            "summary": self.summary,
            "case_dir": str(self.case_dir) if self.case_dir else None,
        }


def run_command(job, cmd, env=None, password=None):
    job.log("$ " + " ".join("********" if password and part == password else part for part in cmd))
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            errors="replace",
            env={**os.environ, "PYTHONUNBUFFERED": "1", "TERM": "dumb", "COLUMNS": "160", **(env or {})},
        )
    except FileNotFoundError as exc:
        job.log(str(exc))
        return 127
    job.process = proc
    for line in proc.stdout:
        line = line.rstrip()
        if password:
            line = line.replace(password, "********")
        if line.strip():
            job.log(line)
    return proc.wait()


def start_job(kind, title, case_dir, worker):
    job = Job(kind, title, case_dir)
    with jobs_lock:
        jobs[job.id] = job

    def target():
        try:
            worker(job)
        except Exception as exc:  # surface any crash to the user
            job.log(f"Unexpected error: {exc}")
            job.finish("failed", str(exc))

    threading.Thread(target=target, daemon=True).start()
    return job


SKIP_JSON = {"info", "case", "summary", "alerts", "urls"}
SEVERE = {"HIGH", "CRITICAL"}


def summarise_case(case_dir):
    """Collect MVT's JSON results into something the UI can render."""
    case_dir = Path(case_dir)
    modules, detections, notes = [], [], []

    alerts_file = case_dir / "alerts.json"
    if alerts_file.exists():
        try:
            for alert in json.loads(alerts_file.read_text(errors="replace")):
                entry = {
                    "module": alert.get("module") or "",
                    "level": alert.get("level"),
                    "message": alert.get("message"),
                    "time": alert.get("event_time"),
                    "record": {**(alert.get("event") or {}), "matched_indicator": alert.get("matched_indicator")},
                }
                (detections if alert.get("level") in SEVERE or alert.get("matched_indicator") else notes).append(entry)
        except Exception:
            pass

    for path in sorted(case_dir.glob("*.json")):
        if path.stem in SKIP_JSON:
            continue
        try:
            data = json.loads(path.read_text(errors="replace"))
        except Exception:
            continue
        if path.stem.endswith("_detected"):
            # Older MVT versions write one *_detected.json per module.
            if alerts_file.exists():
                continue
            records = data if isinstance(data, list) else [data]
            for record in records[:200]:
                detections.append({"module": path.stem[: -len("_detected")], "level": "HIGH", "record": record})
        else:
            modules.append({"name": path.stem, "records": len(data) if isinstance(data, (list, dict)) else 0})

    timeline = []
    for name in ("alerts_timeline.csv", "timeline_detected.csv"):
        timeline_file = case_dir / name
        if timeline_file.exists():
            with open(timeline_file, newline="", errors="replace") as handle:
                timeline = list(csv.DictReader(handle))[:500]
            break

    log_lines = []
    log_file = case_dir / "command.log"
    if log_file.exists():
        for line in log_file.read_text(errors="replace").splitlines():
            if " - WARNING - " in line or " - ERROR - " in line:
                log_lines.append(line.split(" - ", 3)[-1].strip())
    for note in notes:
        log_lines.append(f"[{note['level']}] {note['module']}: {note['message']}")

    return {
        "verdict": "detected" if detections else "clean",
        "detections": detections[:500],
        "detection_count": len(detections),
        "modules": modules,
        "timeline": timeline,
        "warnings": log_lines[-200:],
        "files": sorted(p.name for p in case_dir.iterdir() if p.is_file()),
    }


def new_case_dir(label):
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)[:40] or "scan"
    path = CASES_DIR / f"{stamp}_{safe}"
    path.mkdir(parents=True, exist_ok=True)
    return path


# ---------------------------------------------------------------- routes


@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.before_request
def local_only():
    # Guard against DNS rebinding: only accept requests addressed to localhost.
    host = (request.host or "").split(":")[0]
    if host not in ("127.0.0.1", "localhost"):
        abort(403)


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/static/<path:name>")
def static_files(name):
    return send_from_directory(STATIC_DIR, name)


@app.get("/api/status")
def status():
    return jsonify(
        {
            "mvt": mvt_version(),
            "python": platform.python_version(),
            "platform": platform.system(),
            "iocs": ioc_status(),
            "cases_dir": str(CASES_DIR),
            "home": str(Path.home()),
            "support_url": os.environ.get("PHONEFORENSICS_SUPPORT_URL", SUPPORT_URL),
        }
    )


@app.get("/api/ios-backups")
def ios_backups():
    found = []
    for root in itunes_backup_roots():
        for child in sorted(root.iterdir()):
            if child.is_dir() and (child / "Manifest.plist").exists():
                found.append(describe_ios_backup(child))
    return jsonify(found)


@app.get("/api/browse")
def browse():
    raw = request.args.get("path") or str(Path.home())
    if raw == "::drives" and platform.system() == "Windows":
        drives = [f"{d}:\\" for d in string.ascii_uppercase if os.path.exists(f"{d}:\\")]
        return jsonify({"path": "::drives", "parent": None, "entries": [{"name": d, "path": d, "dir": True} for d in drives]})
    path = Path(raw).expanduser()
    if not path.exists():
        return jsonify({"error": "That location doesn't exist."}), 404
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
    except PermissionError:
        return jsonify({"error": "Permission denied for this folder."}), 403
    parent = str(path.parent) if path.parent != path else ("::drives" if platform.system() == "Windows" else None)
    return jsonify(
        {
            "path": str(path),
            "parent": parent,
            "entries": entries[:1000],
            "is_ios_backup": (path / "Manifest.plist").exists(),
            "ios_backup": describe_ios_backup(path) if (path / "Manifest.plist").exists() else None,
        }
    )


@app.post("/api/iocs/update")
def update_iocs():
    def worker(job):
        code = run_command(job, mvt_executable("mvt-ios") + ["download-iocs"])
        job.summary = ioc_status()
        job.finish("done" if code == 0 else "failed", None if code == 0 else f"Exit code {code}")

    job = start_job("iocs", "Updating threat indicators", None, worker)
    return jsonify(job.to_dict())


@app.post("/api/scan")
def scan():
    body = request.get_json(force=True)
    scan_type = body.get("type")
    target = body.get("path", "").strip()
    label = body.get("label", "").strip() or "scan"
    password = body.get("password") or None
    fast = bool(body.get("fast"))
    extra_iocs = [p for p in body.get("iocs", []) if p]

    if not body.get("consent"):
        return jsonify({"error": "Please confirm the phone owner has agreed to this check."}), 400
    if scan_type not in SCAN_TYPES:
        return jsonify({"error": "Unknown scan type."}), 400
    if not target or not Path(target).exists():
        return jsonify({"error": "Please choose a file or folder that exists."}), 400

    spec = SCAN_TYPES[scan_type]
    case_dir = new_case_dir(label)
    (case_dir / "case.json").write_text(
        json.dumps({"label": label, "type": scan_type, "source": target, "created": datetime.now().isoformat()}, indent=2)
    )

    def worker(job):
        source = target
        if scan_type == "ios-backup" and password:
            job.log("Unlocking encrypted backup - this can take a while...")
            decrypted = case_dir / "decrypted_backup"
            code = run_command(
                job,
                mvt_executable("mvt-ios") + ["decrypt-backup", "-d", str(decrypted), target],
                env={"MVT_IOS_BACKUP_PASSWORD": password},
            )
            if code != 0:
                job.finish("failed", "Could not unlock the backup. Please double-check the password.")
                return
            source = str(decrypted)

        cmd = mvt_executable(spec["tool"]) + [spec["command"], "--output", str(case_dir)]
        for ioc in extra_iocs:
            cmd += ["--iocs", ioc]
        if fast and scan_type.startswith("ios"):
            cmd.append("--fast")
        if scan_type in ("android-qf", "android-backup"):
            cmd.append("--non-interactive")
            if password:
                cmd += ["--backup-password", password]
        cmd.append(source)
        code = run_command(job, cmd, password=password)
        job.summary = summarise_case(case_dir)
        job.summary["completed"] = code == 0
        (case_dir / "summary.json").write_text(json.dumps(job.summary, indent=2, default=str))
        job.finish("done" if code == 0 else "failed", None if code == 0 else f"MVT exited with code {code}")

    job = start_job("scan", label, case_dir, worker)
    return jsonify(job.to_dict())


@app.get("/api/jobs/<job_id>")
def job_info(job_id):
    job = jobs.get(job_id) or abort(404)
    return jsonify(job.to_dict())


@app.post("/api/jobs/<job_id>/cancel")
def job_cancel(job_id):
    job = jobs.get(job_id) or abort(404)
    if job.process and job.process.poll() is None:
        job.process.terminate()
    return jsonify({"ok": True})


@app.get("/api/jobs/<job_id>/stream")
def job_stream(job_id):
    job = jobs.get(job_id) or abort(404)

    def events():
        sent = 0
        while True:
            with job.cond:
                while sent >= len(job.lines) and job.status == "running":
                    job.cond.wait(timeout=15)
                    if sent >= len(job.lines) and job.status == "running":
                        break
                new = job.lines[sent:]
                sent += len(new)
                done = job.status != "running" and sent >= len(job.lines)
            for line in new:
                yield f"data: {json.dumps({'line': line})}\n\n"
            if not new and not done:
                yield ": keepalive\n\n"
            if done:
                yield f"event: done\ndata: {json.dumps(job.to_dict(), default=str)}\n\n"
                return

    return Response(events(), mimetype="text/event-stream", headers={"X-Accel-Buffering": "no"})


def load_summary(path):
    summary = summarise_case(path)
    saved = path / "summary.json"
    try:
        summary["completed"] = json.loads(saved.read_text()).get("completed", True)
    except Exception:
        summary["completed"] = False
    return summary


@app.get("/api/cases")
def list_cases():
    cases = []
    if CASES_DIR.exists():
        for path in sorted(CASES_DIR.iterdir(), reverse=True):
            meta_file = path / "case.json"
            if not meta_file.exists():
                continue
            meta = json.loads(meta_file.read_text())
            summary = load_summary(path)
            verdict = summary["verdict"]
            if verdict == "clean" and not summary["completed"]:
                verdict = "failed"
            cases.append({"id": path.name, **meta, "verdict": verdict, "detection_count": summary["detection_count"]})
    return jsonify(cases)


def case_path(case_id):
    path = (CASES_DIR / case_id).resolve()
    if path.parent != CASES_DIR.resolve() or not path.is_dir():
        abort(404)
    return path


@app.get("/api/cases/<case_id>")
def get_case(case_id):
    path = case_path(case_id)
    meta = json.loads((path / "case.json").read_text())
    summary = load_summary(path)
    return jsonify({"id": case_id, **meta, "summary": summary, "path": str(path)})


@app.get("/api/cases/<case_id>/files/<name>")
def case_file(case_id, name):
    path = case_path(case_id)
    return send_from_directory(path, name, as_attachment=True)


@app.post("/api/cases/<case_id>/open")
def open_case_folder(case_id):
    path = case_path(case_id)
    system = platform.system()
    try:
        if system == "Windows":
            os.startfile(path)  # noqa: S606
        elif system == "Darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"ok": True})


def main():
    parser = argparse.ArgumentParser(description="PhoneForensics - point-and-click MVT")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="Don't open a browser window automatically")
    args = parser.parse_args()

    CASES_DIR.mkdir(parents=True, exist_ok=True)
    url = f"http://127.0.0.1:{args.port}/"
    print(f"\n  PhoneForensics is running at {url}\n  Keep this window open while you use it. Press Ctrl+C to quit.\n")
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=args.port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
