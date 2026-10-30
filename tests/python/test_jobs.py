from __future__ import annotations

import sys

from conftest import wait_for

from phoneforensics.jobs import Job, JobRegistry, run_command


def test_run_command_streams_output_and_masks_secrets() -> None:
    job = Job("scan", "t", None)
    code = run_command(
        job, [sys.executable, "-c", "print('token=abc123'); print(); print('done')"], secrets=["abc123", ""]
    )
    assert code == 0
    assert job.lines[1:] == ["token=********", "done"]
    assert "abc123" not in job.lines[0]


def test_run_command_reports_missing_program() -> None:
    job = Job("scan", "t", None)
    assert run_command(job, ["definitely-not-a-program-xyz"]) == 127
    assert "Could not start" in job.lines[-1]


def test_worker_crash_marks_job_failed_with_friendly_message() -> None:
    registry = JobRegistry()

    def boom(job: Job) -> None:
        raise RuntimeError("kaboom")

    job = wait_for(registry, registry.start("scan", "t", None, boom).id)
    assert job.status == "failed"
    assert job.error and "Something went wrong" in job.error
    assert "kaboom" in job.lines[-1]


def test_stream_yields_all_lines_then_finishes() -> None:
    job = Job("iocs", "t", None)
    job.log("a")
    job.log("b")
    job.finish("done")
    assert list(job.stream(0.01)) == [(["a", "b"], True)]


def test_any_running_filters_by_kind() -> None:
    registry = JobRegistry()
    job = registry.start("iocs", "t", None, lambda j: None)  # never finishes
    assert registry.any_running()
    assert not registry.any_running(["scan"])
    job.finish("done")
    assert not registry.any_running()
