"""Background jobs: long-running MVT commands whose output is streamed to the browser."""

from __future__ import annotations

import logging
import os
import subprocess
import threading
import time
import uuid
from collections.abc import Callable, Iterator, Mapping, Sequence
from pathlib import Path
from typing import Any, Literal

log = logging.getLogger(__name__)

JobKind = Literal["scan", "iocs", "update"]
JobStatus = Literal["running", "done", "failed"]
MASK = "********"
# Unbuffered, plain-text UTF-8 output from child processes. Without the UTF-8 settings, Windows
# encodes piped output with the old ANSI code page, which can crash MVT's console output.
CHILD_ENV = {"PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "TERM": "dumb", "COLUMNS": "160"}


class Job:
    """One background task. Thread-safe: workers append lines, readers wait on `cond`."""

    def __init__(self, kind: JobKind, title: str, case_dir: Path | None) -> None:
        self.id = uuid.uuid4().hex[:12]
        self.kind: JobKind = kind
        self.title = title
        self.case_dir = case_dir
        self.status: JobStatus = "running"
        self.lines: list[str] = []
        self.started = time.time()
        self.finished: float | None = None
        self.summary: dict[str, Any] | None = None
        self.error: str | None = None
        self.cond = threading.Condition()
        self.process: subprocess.Popen[str] | None = None

    def log(self, line: str) -> None:
        with self.cond:
            self.lines.append(line)
            self.cond.notify_all()

    def finish(self, status: JobStatus, error: str | None = None) -> None:
        with self.cond:
            self.status = status
            self.error = error
            self.finished = time.time()
            self.cond.notify_all()
        log.info("job finished", extra={"job_id": self.id, "kind": self.kind, "status": status})

    def cancel(self) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()

    def to_dict(self) -> dict[str, Any]:
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

    def stream(self, keepalive_seconds: float) -> Iterator[tuple[list[str], bool]]:
        """Yield (new_lines, finished) until the job is finished and every line has been sent."""
        sent = 0
        while True:
            with self.cond:
                if sent >= len(self.lines) and self.status == "running":
                    self.cond.wait(timeout=keepalive_seconds)
                new = self.lines[sent:]
                sent += len(new)
                done = self.status != "running" and sent >= len(self.lines)
            yield new, done
            if done:
                return


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def all(self) -> list[Job]:
        with self._lock:
            return list(self._jobs.values())

    def any_running(self, kinds: Sequence[JobKind] | None = None) -> bool:
        with self._lock:
            return any(j.status == "running" and (kinds is None or j.kind in kinds) for j in self._jobs.values())

    def start(self, kind: JobKind, title: str, case_dir: Path | None, worker: Callable[[Job], None]) -> Job:
        job = Job(kind, title, case_dir)
        with self._lock:
            self._jobs[job.id] = job
        log.info("job started", extra={"job_id": job.id, "kind": kind})

        def target() -> None:
            try:
                worker(job)
            except Exception as exc:  # any crash must still reach the user
                log.exception("job crashed", extra={"job_id": job.id})
                job.log(f"Unexpected error: {exc}")
                job.finish("failed", "Something went wrong. The technical details have more information.")

        threading.Thread(target=target, name=f"job-{job.id}", daemon=True).start()
        return job


def run_command(
    job: Job,
    cmd: Sequence[str],
    env: Mapping[str, str] | None = None,
    secrets: Sequence[str] = (),
) -> int:
    """Run a command, streaming its output into the job. Any `secrets` are masked in the log."""
    hidden = [s for s in secrets if s]

    def mask(text: str) -> str:
        for secret in hidden:
            text = text.replace(secret, MASK)
        return text

    job.log("$ " + mask(" ".join(cmd)))
    try:
        proc = subprocess.Popen(  # noqa: S603 - commands are built from fixed MVT/git/pip arguments
            list(cmd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            env={**os.environ, **CHILD_ENV, **(env or {})},
        )
    except OSError as exc:
        job.log(f"Could not start {cmd[0]}: {exc}")
        return 127
    job.process = proc
    for raw in proc.stdout or ():  # always set because stdout=PIPE
        line = raw.rstrip()
        if line.strip():
            job.log(mask(line))
    return proc.wait()
