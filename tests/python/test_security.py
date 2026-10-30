from __future__ import annotations

from flask.testing import FlaskClient


def test_requests_to_other_hostnames_are_refused(client: FlaskClient) -> None:
    response = client.get("/api/status", headers={"Host": "evil.example"})
    assert response.status_code == 403


def test_localhost_and_loopback_are_allowed(client: FlaskClient) -> None:
    for host in ["localhost:8765", "127.0.0.1:8765", "LOCALHOST"]:
        assert client.get("/api/status", headers={"Host": host}).status_code == 200


def test_cross_site_post_is_refused(client: FlaskClient) -> None:
    response = client.post("/api/iocs/update", json={}, headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert "other websites" in response.get_json()["error"]


def test_other_local_port_is_refused(client: FlaskClient) -> None:
    response = client.post("/api/restart", json={}, headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 403


def test_simple_form_post_is_refused(client: FlaskClient) -> None:
    # A cross-site <form> or no-cors fetch can only send these content types.
    for content_type in ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]:
        response = client.post("/api/restart", data="{}", content_type=content_type)
        assert response.status_code == 403, content_type


def test_same_origin_json_post_is_allowed(client: FlaskClient) -> None:
    response = client.post("/api/jobs/x/cancel", json={}, headers={"Origin": "http://localhost"})
    assert response.status_code == 404  # reached the route


def test_security_headers_are_set(client: FlaskClient) -> None:
    headers = client.get("/").headers
    assert "script-src 'self'" in headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "no-referrer"
    # API responses may contain phone data, so they are never cached.
    assert client.get("/api/status").headers["Cache-Control"] == "no-store"


def test_errors_are_json(client: FlaskClient) -> None:
    response = client.get("/api/nothing-here")
    assert response.status_code == 404
    assert "error" in response.get_json()
