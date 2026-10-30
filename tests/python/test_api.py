from __future__ import annotations

import json
from pathlib import Path

import pytest
from conftest import make_case, post, start_blocking_job, wait_for
from flask.testing import FlaskClient

from phoneforensics.config import Settings
from phoneforensics.jobs import JobRegistry


def scan_body(evidence_path: Path, **overrides: object) -> dict[str, object]:
    return {
        "type": "ios-backup",
        "path": str(evidence_path),
        "label": "Test",
        "password": "",
        "fast": False,
        "consent": True,
        **overrides,
    }


def test_status_reports_versions_and_settings(client: FlaskClient, settings: Settings) -> None:
    data = client.get("/api/status").get_json()
    assert data["version"]
    assert data["support_url"] == "https://example.org/support"
    assert data["cases_dir"] == str(settings.cases_dir)
    assert set(data["iocs"]) == {"count", "updated"}


def test_index_and_static_files_are_served(client: FlaskClient) -> None:
    assert b'type="module"' in client.get("/").data
    assert client.get("/static/js/main.js").status_code == 200
    assert client.get("/static/../server.py").status_code == 404


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"consent": False}, "agreed"),
        ({"consent": "yes"}, "agreed"),
        ({"type": "nokia"}, "Unknown"),
        ({"path": "/definitely/not/here"}, "exists"),
        ({"path": ""}, "exists"),
        ({"label": 123}, "not valid"),
        ({"password": "x" * 5000}, "not valid"),
        ({"path": "bad\x00path"}, "not valid"),
    ],
)
def test_scan_rejects_invalid_requests(
    client: FlaskClient, evidence: Path, overrides: dict[str, object], message: str
) -> None:
    response = post(client, "/api/scan", scan_body(evidence, **overrides))
    assert response.status_code == 400
    assert message in response.get_json()["error"]


def test_scan_rejects_non_object_body(client: FlaskClient) -> None:
    response = client.post("/api/scan", data="[1, 2]", content_type="application/json")
    assert response.status_code == 400


def test_clean_scan_end_to_end(client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path) -> None:
    job = post(client, "/api/scan", scan_body(evidence)).get_json()
    done = wait_for(registry, job["id"])
    assert done.status == "done"
    case_id = Path(job["case_dir"]).name
    listed = client.get("/api/cases").get_json()
    assert [(c["id"], c["verdict"]) for c in listed] == [(case_id, "clean")]
    detail = client.get(f"/api/cases/{case_id}").get_json()
    assert detail["label"] == "Test"
    assert detail["summary"]["modules"] == [{"name": "sms", "records": 2}]


def test_detected_scan_is_flagged(
    client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_MVT_MODE", "detected")
    job = post(client, "/api/scan", scan_body(evidence)).get_json()
    wait_for(registry, job["id"])
    listed = client.get("/api/cases").get_json()
    assert listed[0]["verdict"] == "detected"
    assert listed[0]["detection_count"] == 1


def test_failed_scan_is_reported_as_failed(
    client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_MVT_MODE", "crash")
    job = post(client, "/api/scan", scan_body(evidence)).get_json()
    assert wait_for(registry, job["id"]).status == "failed"
    assert client.get("/api/cases").get_json()[0]["verdict"] == "failed"


def test_ios_password_goes_through_environment_and_is_masked(
    client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path
) -> None:
    job = post(client, "/api/scan", scan_body(evidence, password="hunter2")).get_json()
    done = wait_for(registry, job["id"])
    log = "\n".join(done.lines)
    assert "password from env is ********" in log
    assert "hunter2" not in log


def test_android_password_is_masked_in_log(
    client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path
) -> None:
    job = post(client, "/api/scan", scan_body(evidence, type="android-qf", password="hunter2")).get_json()
    done = wait_for(registry, job["id"])
    assert "hunter2" not in "\n".join(done.lines)


def test_wrong_backup_password_fails_cleanly(
    client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FAKE_MVT_MODE", "bad-password")
    job = post(client, "/api/scan", scan_body(evidence, password="wrong")).get_json()
    done = wait_for(registry, job["id"])
    assert done.status == "failed"
    assert done.error and "password" in done.error


def test_job_stream_sends_lines_then_done(
    client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path
) -> None:
    job = post(client, "/api/scan", scan_body(evidence)).get_json()
    wait_for(registry, job["id"])
    body = client.get(f"/api/jobs/{job['id']}/stream").get_data(as_text=True)
    assert "Running module" in body
    assert body.rstrip().splitlines()[-2] == "event: done"


def test_unknown_job_is_404(client: FlaskClient) -> None:
    assert client.get("/api/jobs/nope").status_code == 404
    assert post(client, "/api/jobs/nope/cancel").status_code == 404


def test_case_routes_refuse_unknown_and_traversal(client: FlaskClient) -> None:
    for case_id in ["missing", "..", "..%2F..%2Fetc"]:
        assert client.get(f"/api/cases/{case_id}").status_code == 404


def test_case_file_download(client: FlaskClient, settings: Settings) -> None:
    make_case(settings.cases_dir, "c1", {"sms.json": [1]})
    response = client.get("/api/cases/c1/files/sms.json")
    assert response.status_code == 200
    assert "attachment" in response.headers["Content-Disposition"]
    assert json.loads(response.data) == [1]
    assert client.get("/api/cases/c1/files/..%2Fc1%2Fcase.json").status_code == 404


def test_browse_lists_folders_first_and_hides_dotfiles(client: FlaskClient, tmp_path: Path) -> None:
    (tmp_path / "b_folder").mkdir()
    (tmp_path / "a_file.txt").write_text("")
    (tmp_path / ".hidden").write_text("")
    data = client.get(f"/api/browse?path={tmp_path}").get_json()
    names = [e["name"] for e in data["entries"]]
    assert names.index("b_folder") < names.index("a_file.txt")
    assert ".hidden" not in names
    assert data["parent"] == str(tmp_path.parent)


def test_browse_detects_ios_backup(client: FlaskClient, tmp_path: Path) -> None:
    import plistlib

    (tmp_path / "Manifest.plist").write_bytes(plistlib.dumps({"IsEncrypted": True}))
    data = client.get(f"/api/browse?path={tmp_path}").get_json()
    assert data["is_ios_backup"] is True
    assert data["ios_backup"]["encrypted"] is True


def test_browse_missing_folder(client: FlaskClient) -> None:
    response = client.get("/api/browse?path=/definitely/not/here")
    assert response.status_code == 404
    assert "doesn't exist" in response.get_json()["error"]


def test_second_scan_is_refused_while_one_runs(client: FlaskClient, registry: JobRegistry, evidence: Path) -> None:
    release = start_blocking_job(registry, "scan")
    try:
        response = post(client, "/api/scan", scan_body(evidence))
        assert response.status_code == 409
    finally:
        release.set()


def test_consent_is_recorded_with_the_check(
    client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path
) -> None:
    job = post(client, "/api/scan", scan_body(evidence)).get_json()
    wait_for(registry, job["id"])
    meta = client.get(f"/api/cases/{Path(job['case_dir']).name}").get_json()
    assert meta["consent"]["confirmed"] is True
    assert meta["consent"]["confirmed_at"]


def test_decrypted_backup_copy_is_removed_after_the_check(
    client: FlaskClient, registry: JobRegistry, fake_mvt: Path, evidence: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from phoneforensics import mvt as mvt_module

    original = mvt_module.decrypt_command

    def decrypt_and_create(source: str, destination: Path) -> list[str]:
        destination.mkdir(parents=True)
        (destination / "Manifest.db").write_text("secret phone data")
        return original(source, destination)

    monkeypatch.setattr(mvt_module, "decrypt_command", decrypt_and_create)
    job = post(client, "/api/scan", scan_body(evidence, password="pw")).get_json()
    wait_for(registry, job["id"])
    assert not (Path(job["case_dir"]) / "decrypted_backup").exists()


def test_delete_check_removes_everything(client: FlaskClient, settings: Settings) -> None:
    folder = make_case(settings.cases_dir, "c1", {"sms.json": [1]})
    assert post(client, "/api/cases/c1/delete").get_json() == {"ok": True}
    assert not folder.exists()
    assert post(client, "/api/cases/c1/delete").status_code == 404
    assert post(client, "/api/cases/..%2F..%2Fx/delete").status_code == 404


def test_cannot_delete_a_running_check(client: FlaskClient, registry: JobRegistry, settings: Settings) -> None:
    folder = make_case(settings.cases_dir, "c2", {})
    import threading

    release = threading.Event()

    def worker(job: object) -> None:
        release.wait(5)

    registry.start("scan", "busy", folder.resolve(), worker)
    try:
        assert post(client, "/api/cases/c2/delete").status_code == 409
        assert folder.exists()
    finally:
        release.set()
