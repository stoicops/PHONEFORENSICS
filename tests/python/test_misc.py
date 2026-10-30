from __future__ import annotations

import plistlib
import socket
from datetime import datetime
from pathlib import Path

from phoneforensics import cli, ios
from phoneforensics.config import load_settings


def test_settings_from_environment(tmp_path: Path) -> None:
    settings = load_settings({"PHONEFORENSICS_HOME": str(tmp_path), "PHONEFORENSICS_SUPPORT_URL": "https://x.org"})
    assert settings.cases_dir == tmp_path / "cases"
    assert settings.support_url == "https://x.org"


def test_non_https_support_link_is_dropped() -> None:
    assert load_settings({"PHONEFORENSICS_SUPPORT_URL": "javascript:alert(1)"}).support_url == ""


def test_default_support_link() -> None:
    assert load_settings({}).support_url.startswith("https://")


def test_describe_backup_reads_metadata(tmp_path: Path) -> None:
    (tmp_path / "Info.plist").write_bytes(
        plistlib.dumps(
            {
                "Device Name": "Maria's iPhone",
                "Product Type": "iPhone15,2",
                "Product Version": "18.1",
                "Last Backup Date": datetime(2026, 1, 2, 3, 4),
            }
        )
    )
    (tmp_path / "Manifest.plist").write_bytes(plistlib.dumps({"IsEncrypted": False}))
    info = ios.describe(tmp_path)
    assert info == {
        "path": str(tmp_path),
        "name": "Maria's iPhone",
        "encrypted": False,
        "model": "iPhone15,2",
        "ios": "18.1",
        "date": "2026-01-02T03:04",
    }


def test_describe_backup_survives_corrupt_files(tmp_path: Path) -> None:
    (tmp_path / "Info.plist").write_text("garbage")
    assert ios.describe(tmp_path)["name"] == tmp_path.name


def test_find_backups_in_macos_location(tmp_path: Path) -> None:
    backup = tmp_path / ios.BACKUP_ROOTS[0] / "00008030-ABC"
    backup.mkdir(parents=True)
    (backup / "Manifest.plist").write_bytes(plistlib.dumps({"IsEncrypted": True}))
    (backup.parent / "not-a-backup").mkdir()
    found = ios.find_backups(tmp_path)
    assert [b["path"] for b in found] == [str(backup)]


def test_wait_for_port_free_and_busy() -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    assert cli.wait_for_port(port, timeout=1) is True
    with socket.socket() as busy:
        busy.bind(("127.0.0.1", 0))
        busy.listen()
        assert cli.wait_for_port(busy.getsockname()[1], timeout=0.6) is False


def test_parse_args_defaults() -> None:
    args = cli.parse_args([])
    assert args.port == 8765
    assert args.no_browser is False
