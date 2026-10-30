"""Checking for and installing new versions of PhoneForensics and MVT."""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal, TypedDict

from packaging.version import InvalidVersion, Version

from . import __version__, mvt
from .config import (
    GIT_TIMEOUT_SECONDS,
    HTTP_TIMEOUT_SECONDS,
    LATEST_RELEASE_API,
    MVT_PYPI_API,
    PACKAGE_DIR,
    RELEASES_URL,
)
from .jobs import Job, run_command

log = logging.getLogger(__name__)

FetchJson = Callable[[str], Any]
Method = Literal["git", "download"]
APP_UNREACHABLE = "Could not reach GitHub to look for app updates."
MVT_UNREACHABLE = "Could not reach PyPI to look for MVT updates."
LOCKFILE = "requirements.lock"
PIP_INSTALL = ("-m", "pip", "install", "--upgrade", "--disable-pip-version-check")


class Component(TypedDict):
    current: str | None
    latest: str | None
    available: bool


class AppComponent(Component):
    url: str


class UpdateReport(TypedDict):
    app: AppComponent
    mvt: Component
    method: Method
    errors: list[str]


def fetch_json(url: str) -> Any:
    if not url.startswith("https://"):
        raise ValueError("Only https URLs are fetched.")
    request = urllib.request.Request(  # noqa: S310 - scheme checked above
        url, headers={"User-Agent": "PhoneForensics", "Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:  # noqa: S310 - scheme checked above
        return json.load(response)


def is_newer(candidate: str, current: str | None) -> bool:
    if not current:
        return True
    try:
        return Version(candidate.lstrip("v")) > Version(current.lstrip("v"))
    except InvalidVersion:
        return False


def git_root(start: Path = PACKAGE_DIR) -> Path | None:
    """The git checkout PhoneForensics runs from, if it was installed with `git clone`."""
    if shutil.which("git") is None:
        return None
    for folder in (start, *start.parents):
        if (folder / ".git").exists():
            return folder
    return None


def _git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    command = ["git", "-C", str(root), *args]
    # git is looked up on PATH on purpose; the arguments are fixed by this module.
    return subprocess.run(command, capture_output=True, text=True, timeout=GIT_TIMEOUT_SECONDS, check=False)  # noqa: S603


def _commits_behind(root: Path) -> int | None:
    try:
        if _git(root, "fetch", "--quiet").returncode != 0:
            return None
        behind = _git(root, "rev-list", "--count", "HEAD..@{u}")
    except (OSError, subprocess.TimeoutExpired):
        return None
    if behind.returncode != 0:
        return None
    return int(behind.stdout.strip() or 0)


def check(fetch: FetchJson = fetch_json, root: Path | None = None, use_git: bool = True) -> UpdateReport:
    root = root if root is not None else (git_root() if use_git else None)
    report: UpdateReport = {
        "app": {"current": __version__, "latest": None, "available": False, "url": RELEASES_URL},
        "mvt": {"current": mvt.installed_version(), "latest": None, "available": False},
        "method": "git" if root else "download",
        "errors": [],
    }
    if root:
        behind = _commits_behind(root)
        if behind is None:
            report["errors"].append(APP_UNREACHABLE)
        else:
            report["app"]["available"] = behind > 0
            report["app"]["latest"] = f"{behind} new change{'s' if behind != 1 else ''}" if behind else __version__
    else:
        try:
            release = fetch(LATEST_RELEASE_API)
            latest = str(release.get("tag_name", "")).lstrip("v")
            report["app"]["latest"] = latest or None
            html_url = str(release.get("html_url") or "")
            # Only ever link users to this project's GitHub pages.
            report["app"]["url"] = html_url if html_url.startswith(RELEASES_URL) else RELEASES_URL
            report["app"]["available"] = bool(latest) and is_newer(latest, __version__)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:  # 404 means nothing has been released yet
                report["errors"].append(APP_UNREACHABLE)
        except (OSError, ValueError, AttributeError):
            report["errors"].append(APP_UNREACHABLE)
    try:
        latest_mvt = str(fetch(MVT_PYPI_API)["info"]["version"])
        report["mvt"]["latest"] = latest_mvt
        report["mvt"]["available"] = is_newer(latest_mvt, report["mvt"]["current"])
    except (OSError, ValueError, KeyError, TypeError):
        report["errors"].append(MVT_UNREACHABLE)
    return report


def apply(job: Job, root: Path | None) -> None:
    """Job worker: pull the latest code (git installs only), reinstall, then upgrade MVT."""
    pip = [sys.executable, *PIP_INSTALL]
    if root:
        job.log("Downloading the latest PhoneForensics...")
        if run_command(job, ["git", "-C", str(root), "pull", "--ff-only"]) != 0:
            job.finish(
                "failed", "Could not download the app update. If you changed files in this folder, ask for help."
            )
            return
        lockfile = root / LOCKFILE
        locked = run_command(job, [*pip, "-r", str(lockfile)]) if lockfile.is_file() else 0
        if locked != 0 or run_command(job, [*pip, "--no-deps", "-e", str(root)]) != 0:
            job.finish("failed", "Could not install the app update.")
            return
    # MVT is deliberately allowed past the lockfile: new releases add detections for new spyware.
    job.log("Updating MVT...")
    if run_command(job, [*pip, "mvt"]) != 0:
        job.finish("failed", "Could not update MVT. Check your internet connection.")
        return
    job.finish("done")
