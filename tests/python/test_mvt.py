from __future__ import annotations

from pathlib import Path

import pytest

from phoneforensics import mvt

OUT = Path("/out")  # rendered with the native separator, e.g. "\\out" on Windows


@pytest.fixture(autouse=True)
def fixed_executable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mvt, "executable", lambda tool: [tool])


def test_ios_backup_command_with_fast_mode() -> None:
    cmd = mvt.scan_command("ios-backup", "/b", OUT, fast=True, password=None, extra_iocs=[])
    assert cmd == ["mvt-ios", "check-backup", "--output", str(OUT), "--fast", "/b"]


def test_ios_password_is_never_put_on_the_command_line() -> None:
    cmd = mvt.scan_command("ios-backup", "/b", OUT, fast=False, password="s3cret", extra_iocs=[])
    assert "s3cret" not in cmd
    assert "s3cret" not in mvt.decrypt_command("/b", Path("/d"))


def test_android_qf_is_non_interactive_and_takes_password() -> None:
    cmd = mvt.scan_command("android-qf", "/q", OUT, fast=True, password="pw", extra_iocs=["/i.stix2"])
    assert cmd == [
        "mvt-android",
        "check-androidqf",
        "--output",
        "/out",
        "--iocs",
        "/i.stix2",
        "--non-interactive",
        "--backup-password",
        "pw",
        "/q",
    ]


def test_bugreport_gets_no_unsupported_flags() -> None:
    cmd = mvt.scan_command("android-bugreport", "/r.zip", OUT, fast=True, password="pw", extra_iocs=[])
    assert cmd == ["mvt-android", "check-bugreport", "--output", str(OUT), "/r.zip"]


def test_indicator_status_counts_stix_files(tmp_path: Path) -> None:
    assert mvt.indicator_status(tmp_path / "missing") == {"count": 0, "updated": None}
    (tmp_path / "a.stix2").write_text("{}")
    (tmp_path / "b.txt").write_text("")
    status = mvt.indicator_status(tmp_path)
    assert status["count"] == 1
    assert status["updated"] is not None
