from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest
from conftest import post, start_blocking_job, wait_for
from flask.testing import FlaskClient

from phoneforensics import logs, updates
from phoneforensics.jobs import Job, JobRegistry


def test_indicator_download_job(client: FlaskClient, registry: JobRegistry, fake_mvt: Path) -> None:
    job = post(client, "/api/iocs/update").get_json()
    assert job["kind"] == "iocs"
    assert wait_for(registry, job["id"]).status == "done"


def test_restart_refused_while_something_runs(client: FlaskClient, registry: JobRegistry) -> None:
    release = start_blocking_job(registry, "iocs")
    try:
        assert post(client, "/api/restart").status_code == 409
        assert post(client, "/api/updates/apply").status_code == 200  # lists download does not block updates
    finally:
        release.set()


def test_update_refused_during_scan(client: FlaskClient, registry: JobRegistry) -> None:
    release = start_blocking_job(registry, "scan")
    try:
        assert post(client, "/api/updates/apply").status_code == 409
    finally:
        release.set()


@pytest.mark.parametrize(
    ("root", "codes", "status", "commands"),
    [
        (None, [0], "done", ["pip install mvt"]),
        (Path("/repo"), [0, 0, 0], "done", ["git pull", "pip install -e", "pip install mvt"]),
        ("lock", [0, 0, 0, 0], "done", ["git pull", "pip install -r", "pip install -e", "pip install mvt"]),
        ("lock", [0, 1], "failed", ["git pull", "pip install -r"]),
        (Path("/repo"), [1], "failed", ["git pull"]),
        (Path("/repo"), [0, 1], "failed", ["git pull", "pip install -e"]),
        (None, [1], "failed", ["pip install mvt"]),
    ],
)
def test_apply_runs_steps_in_order_and_stops_on_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    root: Path | str | None,
    codes: list[int],
    status: str,
    commands: list[str],
) -> None:
    if root == "lock":
        (tmp_path / "requirements.lock").write_text("")
        root = tmp_path
    ran: list[str] = []
    results = iter(codes)

    def fake_run(job: Job, cmd: list[str], **_: object) -> int:
        text = " ".join(cmd)
        ran.append(
            "git pull"
            if "pull" in cmd
            else "pip install -r"
            if "-r" in cmd
            else "pip install -e"
            if "-e" in cmd
            else "pip install mvt"
            if "mvt" in cmd
            else text
        )
        return next(results)

    monkeypatch.setattr(updates, "run_command", fake_run)
    job = Job("update", "t", None)
    updates.apply(job, root if isinstance(root, Path) or root is None else None)
    assert job.status == status
    assert ran == commands


def test_updates_route_returns_report(client: FlaskClient, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = {"app": {}, "mvt": {}, "method": "download", "errors": []}
    monkeypatch.setattr(updates, "check", lambda: fake)
    assert client.get("/api/updates").get_json() == fake


def test_json_log_formatter_includes_extra_fields() -> None:
    record = logging.LogRecord("pf", logging.INFO, __file__, 1, "job %s", ("started",), None)
    record.job_id = "abc"
    entry = json.loads(logs.JsonFormatter().format(record))
    assert entry["message"] == "job started"
    assert entry["job_id"] == "abc"
    assert entry["level"] == "INFO"


def test_configure_installs_single_json_handler() -> None:
    logs.configure("warning")
    root = logging.getLogger()
    try:
        assert root.level == logging.WARNING
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, logs.JsonFormatter)
    finally:
        root.setLevel(logging.WARNING)
