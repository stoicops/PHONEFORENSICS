"""Protections for a server that only this computer's browser should talk to.

* Host check: blocks DNS-rebinding, where a website points its own name at 127.0.0.1.
* Origin check + JSON-only writes: blocks other websites from making the browser send
  commands here (CSRF). A cross-site page cannot send `Content-Type: application/json`
  without a CORS preflight, which this server never approves.
* Security headers: a strict Content Security Policy and no framing.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from flask import Request, Response

from .config import ALLOWED_HOSTS

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        # Inline style attributes are used for small layout tweaks; no inline scripts are allowed.
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)

SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
}


def _hostname(value: str) -> str:
    return (urlsplit(f"//{value}").hostname or "").lower()


def rejection_reason(request: Request) -> str | None:
    """Why a request must be refused, or None if it is allowed."""
    if _hostname(request.host or "") not in ALLOWED_HOSTS:
        return "Requests must be addressed to this computer."
    if request.method in UNSAFE_METHODS:
        origin = request.headers.get("Origin")
        # Must be exactly this app (same scheme, host and port), not another local web app.
        if origin is not None and origin.lower() != f"{request.scheme}://{request.host}".lower():
            return "Requests from other websites are not allowed."
        if not request.is_json:
            return "Requests must be sent as JSON."
    return None


def add_security_headers(response: Response) -> Response:
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response
