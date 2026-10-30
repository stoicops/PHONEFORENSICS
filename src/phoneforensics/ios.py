"""Finding and describing iPhone backups made by Finder, iTunes or Apple Devices."""

from __future__ import annotations

import logging
import plistlib
from pathlib import Path
from typing import TypedDict

log = logging.getLogger(__name__)

# Relative to the user's home folder: macOS, iTunes (Windows), Microsoft Store iTunes / Apple Devices.
BACKUP_ROOTS = (
    "Library/Application Support/MobileSync/Backup",
    "AppData/Roaming/Apple Computer/MobileSync/Backup",
    "Apple/MobileSync/Backup",
    "AppData/Roaming/Apple/MobileSync/Backup",
)


class BackupInfo(TypedDict, total=False):
    path: str
    name: str
    encrypted: bool | None
    model: str | None
    ios: str | None
    date: str | None


def is_backup(path: Path) -> bool:
    try:
        return (path / "Manifest.plist").is_file()
    except OSError:
        return False


def describe(path: Path) -> BackupInfo:
    info: BackupInfo = {"path": str(path), "name": path.name, "encrypted": None}
    try:
        info_plist = path / "Info.plist"
        if info_plist.is_file():
            with info_plist.open("rb") as handle:
                data = plistlib.load(handle)
            info["name"] = str(data.get("Device Name") or data.get("Display Name") or path.name)
            info["model"] = data.get("Product Type")
            info["ios"] = data.get("Product Version")
            date = data.get("Last Backup Date")
            info["date"] = date.isoformat(timespec="minutes") if date else None
        manifest = path / "Manifest.plist"
        if manifest.is_file():
            with manifest.open("rb") as handle:
                info["encrypted"] = bool(plistlib.load(handle).get("IsEncrypted"))
    except (OSError, plistlib.InvalidFileException, ValueError):
        log.warning("could not read backup metadata", extra={"path": str(path)})
    return info


def find_backups(home: Path) -> list[BackupInfo]:
    found: list[BackupInfo] = []
    for relative in BACKUP_ROOTS:
        root = home / relative
        try:
            children = sorted(root.iterdir()) if root.is_dir() else []
        except OSError:
            continue  # e.g. macOS refuses access without Full Disk Access
        found.extend(describe(child) for child in children if child.is_dir() and is_backup(child))
    return found
