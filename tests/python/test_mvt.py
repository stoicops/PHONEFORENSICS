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
        str(OUT),
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


def test_executable_prefers_the_script_next_to_this_python(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.undo()  # use the real executable() rather than the fixed one from the autouse fixture
    import sys

    scripts = tmp_path / "venv-bin"
    scripts.mkdir()
    name = "mvt-ios.exe" if sys.platform == "win32" else "mvt-ios"
    script = scripts / name
    script.write_text("")
    script.chmod(0o755)
    monkeypatch.setattr(mvt, "_script_dirs", lambda: [scripts])
    monkeypatch.setenv("PATH", "")
    found = mvt.executable("mvt-ios")
    assert len(found) == 1
    # Windows may report the extension as ".EXE"; its file names are case-insensitive.
    assert Path(found[0]).name.lower() == name and Path(found[0]).parent == scripts


def test_executable_fallback_runs_mvt_without_any_scripts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.undo()
    import subprocess
    import sys

    monkeypatch.setattr("phoneforensics.mvt.shutil.which", lambda *args, **kwargs: None)
    cmd = mvt.executable("mvt-ios")
    assert cmd[0] == sys.executable
    result = subprocess.run([*cmd, "--help"], capture_output=True, text=True, timeout=60, check=False)  # noqa: S603
    assert result.returncode == 0, result.stderr
    assert "download-iocs" in result.stdout
