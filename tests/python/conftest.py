from __future__ import annotations

import json
import sys
import textwrap
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from flask import Flask
from flask.testing import FlaskClient

from phoneforensics import mvt
from phoneforensics.config import Settings
from phoneforensics.jobs import Job, JobKind, JobRegistry
from phoneforensics.server import create_app

FAKE_MVT = textwrap.dedent(
    """
    import json, os, sys
    from pathlib import Path
    args = sys.argv[1:]
    mode = os.environ.get("FAKE_MVT_MODE", "clean")
    print("[mvt.ios.modules.mixed.sms] Running module")
    if "--backup-password" in args:
        print("using password " + args[args.index("--backup-password") + 1])
    if "decrypt-backup" in args:
        print("password from env is " + os.environ.get("MVT_IOS_BACKUP_PASSWORD", ""))
        sys.exit(0 if mode != "bad-password" else 1)
    if "--output" in args:
        out = Path(args[args.index("--output") + 1])
        (out / "sms.json").write_text(json.dumps([{"text": "hi"}, {"text": "there"}]))
        if mode == "detected":
            (out / "alerts.json").write_text(json.dumps([{
                "level": "CRITICAL", "module": "mvt.ios.modules.mixed.sms", "message": "Bad domain",
                "event_time": "2026-01-01 10:00:00", "event": {"text": "x"},
                "matched_indicator": {"ioc": {"value": "bad.example", "name": "Pegasus"}},
            }]))
    sys.exit(3 if mode == "crash" else 0)
    """
)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(data_dir=tmp_path / "data", support_url="https://example.org/support")


@pytest.fixture
def registry() -> JobRegistry:
    return JobRegistry()


@pytest.fixture
def app(settings: Settings, registry: JobRegistry) -> Flask:
    return create_app(settings, registry)


@pytest.fixture
def client(app: Flask) -> FlaskClient:
    return app.test_client()


@pytest.fixture
def fake_mvt(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    script = tmp_path / "fake_mvt.py"
    script.write_text(FAKE_MVT)
    monkeypatch.setattr(mvt, "executable", lambda tool: [sys.executable, str(script)])
    yield script


@pytest.fixture
def evidence(tmp_path: Path) -> Path:
    folder = tmp_path / "evidence"
    folder.mkdir()
    return folder


def post(client: FlaskClient, url: str, body: dict[str, Any] | None = None) -> Any:
    return client.post(url, data=json.dumps(body or {}), content_type="application/json")


def wait_for(registry: JobRegistry, job_id: str, timeout: float = 20) -> Job:
    job = registry.get(job_id)
    assert job is not None
    deadline = time.monotonic() + timeout
    while job.status == "running" and time.monotonic() < deadline:
        time.sleep(0.05)
    assert job.status != "running", "job did not finish in time"
    return job


def make_case(cases_dir: Path, name: str, files: dict[str, Any], meta: dict[str, Any] | None = None) -> Path:
    folder = cases_dir / name
    folder.mkdir(parents=True)
    (folder / "case.json").write_text(
        json.dumps(meta or {"label": name, "type": "ios-backup", "source": "/x", "created": "2026-01-01T00:00:00"})
    )
    for filename, content in files.items():
        (folder / filename).write_text(content if isinstance(content, str) else json.dumps(content))
    return folder


def start_blocking_job(registry: JobRegistry, kind: JobKind) -> threading.Event:
    """Start a job that runs until the returned event is set."""
    release = threading.Event()

    def worker(job: Job) -> None:
        release.wait(5)
        job.finish("done")

    registry.start(kind, "busy", None, worker)
    return release
