"""Everything that knows how MVT is invoked. Command building is pure so it can be tested."""

from __future__ import annotations

import shutil
import sys
from dataclasses import dataclass
from datetime import datetime
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Literal, TypedDict

ScanType = Literal["ios-backup", "ios-fs", "android-qf", "android-bugreport", "android-backup"]
Tool = Literal["mvt-ios", "mvt-android"]

IOS_PASSWORD_ENV = "MVT_IOS_BACKUP_PASSWORD"  # noqa: S105 - variable name, not a password
DECRYPTED_DIR_NAME = "decrypted_backup"


@dataclass(frozen=True)
class ScanSpec:
    tool: Tool
    command: str
    supports_fast: bool = False
    non_interactive: bool = False
    takes_password_flag: bool = False


SCAN_TYPES: dict[str, ScanSpec] = {
    "ios-backup": ScanSpec("mvt-ios", "check-backup", supports_fast=True),
    "ios-fs": ScanSpec("mvt-ios", "check-fs", supports_fast=True),
    "android-qf": ScanSpec("mvt-android", "check-androidqf", non_interactive=True, takes_password_flag=True),
    "android-bugreport": ScanSpec("mvt-android", "check-bugreport"),
    "android-backup": ScanSpec("mvt-android", "check-backup", non_interactive=True, takes_password_flag=True),
}

_MODULES: dict[Tool, str] = {"mvt-ios": "mvt.ios", "mvt-android": "mvt.android"}


def executable(tool: Tool) -> list[str]:
    """Find an MVT entry point, falling back to running the module with this Python."""
    found = shutil.which(tool)
    return [found] if found else [sys.executable, "-m", _MODULES[tool]]


def installed_version() -> str | None:
    try:
        return version("mvt")
    except PackageNotFoundError:
        return None


def indicators_dir() -> Path | None:
    try:
        from mvt.common.indicators import MVT_INDICATORS_FOLDER
    except ImportError:
        return None
    return Path(MVT_INDICATORS_FOLDER)


class IndicatorStatus(TypedDict):
    count: int
    updated: str | None


def indicator_status(folder: Path | None = None) -> IndicatorStatus:
    folder = folder if folder is not None else indicators_dir()
    files = sorted(folder.glob("*.stix2")) if folder and folder.is_dir() else []
    newest = max((f.stat().st_mtime for f in files), default=None)
    return {
        "count": len(files),
        "updated": datetime.fromtimestamp(newest).isoformat(timespec="minutes") if newest else None,
    }


def download_indicators_command() -> list[str]:
    return [*executable("mvt-ios"), "download-iocs"]


def decrypt_command(source: str, destination: Path) -> list[str]:
    """The password goes in the environment (IOS_PASSWORD_ENV), never on the command line."""
    return [*executable("mvt-ios"), "decrypt-backup", "-d", str(destination), source]


def scan_command(
    scan_type: str, source: str, output: Path, *, fast: bool, password: str | None, extra_iocs: list[str]
) -> list[str]:
    spec = SCAN_TYPES[scan_type]
    cmd = [*executable(spec.tool), spec.command, "--output", str(output)]
    for ioc in extra_iocs:
        cmd += ["--iocs", ioc]
    if fast and spec.supports_fast:
        cmd.append("--fast")
    if spec.non_interactive:
        cmd.append("--non-interactive")
    if password and spec.takes_password_flag:
        # MVT's Android commands only accept the password as an argument.
        # It is masked in the on-screen log; see README "Security notes".
        cmd += ["--backup-password", password]
    cmd.append(source)
    return cmd
