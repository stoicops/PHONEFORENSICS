from __future__ import annotations

import urllib.error
from email.message import Message
from pathlib import Path
from typing import Any

import pytest

from phoneforensics import __version__, updates
from phoneforensics.config import LATEST_RELEASE_API, MVT_PYPI_API, RELEASES_URL


def fetcher(responses: dict[str, Any]) -> updates.FetchJson:
    def fetch(url: str) -> Any:
        value = responses[url]
        if isinstance(value, Exception):
            raise value
        return value

    return fetch


def http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(LATEST_RELEASE_API, code, "error", Message(), None)


@pytest.fixture(autouse=True)
def mvt_version(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("phoneforensics.mvt.installed_version", lambda: "2026.1.1")


@pytest.mark.parametrize(
    ("candidate", "current", "expected"),
    [
        ("1.2.0", "1.1.9", True),
        ("v1.2.0", "1.2.0", False),
        ("1.10.0", "1.9.0", True),
        ("2026.10.26", None, True),
        ("nonsense", "1.0", False),
    ],
)
def test_is_newer(candidate: str, current: str | None, expected: bool) -> None:
    assert updates.is_newer(candidate, current) is expected


def test_new_release_is_offered_with_its_link() -> None:
    report = updates.check(
        fetcher(
            {
                LATEST_RELEASE_API: {"tag_name": "v99.0.0", "html_url": f"{RELEASES_URL}/tag/v99.0.0"},
                MVT_PYPI_API: {"info": {"version": "2026.1.1"}},
            }
        ),
        use_git=False,
    )
    assert report["method"] == "download"
    assert report["app"] == {
        "current": __version__,
        "latest": "99.0.0",
        "available": True,
        "url": f"{RELEASES_URL}/tag/v99.0.0",
    }
    assert report["mvt"]["available"] is False
    assert report["errors"] == []


def test_release_link_outside_project_is_replaced() -> None:
    report = updates.check(
        fetcher(
            {
                LATEST_RELEASE_API: {"tag_name": "v99.0.0", "html_url": "https://evil.example/x"},
                MVT_PYPI_API: {"info": {"version": "1"}},
            }
        ),
        use_git=False,
    )
    assert report["app"]["url"] == RELEASES_URL


def test_no_releases_yet_is_not_an_error() -> None:
    report = updates.check(
        fetcher({LATEST_RELEASE_API: http_error(404), MVT_PYPI_API: {"info": {"version": "2026.2.1"}}}), use_git=False
    )
    assert report["app"]["available"] is False
    assert report["mvt"] == {"current": "2026.1.1", "latest": "2026.2.1", "available": True}
    assert report["errors"] == []


def test_offline_reports_friendly_errors() -> None:
    report = updates.check(
        fetcher({LATEST_RELEASE_API: OSError("offline"), MVT_PYPI_API: OSError("offline")}), use_git=False
    )
    assert report["errors"] == [updates.APP_UNREACHABLE, updates.MVT_UNREACHABLE]
    assert report["app"]["available"] is False


def test_server_error_from_github_is_reported() -> None:
    report = updates.check(
        fetcher({LATEST_RELEASE_API: http_error(500), MVT_PYPI_API: {"info": {"version": "1"}}}), use_git=False
    )
    assert report["errors"] == [updates.APP_UNREACHABLE]


def test_fetch_json_refuses_non_https() -> None:
    with pytest.raises(ValueError, match="https"):
        updates.fetch_json("file:///etc/passwd")


def test_git_checkout_reports_commits_behind(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(updates, "_commits_behind", lambda root: 3)
    report = updates.check(fetcher({MVT_PYPI_API: {"info": {"version": "1"}}}), root=tmp_path)
    assert report["method"] == "git"
    assert report["app"]["available"] is True
    assert report["app"]["latest"] == "3 new changes"


def test_git_root_finds_enclosing_checkout(tmp_path: Path) -> None:
    (tmp_path / ".git").mkdir()
    nested = tmp_path / "src" / "pkg"
    nested.mkdir(parents=True)
    assert updates.git_root(nested) == tmp_path
