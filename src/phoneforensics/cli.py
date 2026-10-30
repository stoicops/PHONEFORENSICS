"""Command-line entry point: `phoneforensics` or `python -m phoneforensics`."""

from __future__ import annotations

import argparse
import os
import socket
import threading
import time
import webbrowser
from collections.abc import Sequence

from waitress import serve

from . import logs
from .config import DEFAULT_PORT, LOCAL_HOST, PORT_WAIT_SECONDS, SERVER_THREADS, load_settings
from .server import create_app

BROWSER_OPEN_DELAY_SECONDS = 1.0


def wait_for_port(port: int, timeout: float = PORT_WAIT_SECONDS) -> bool:
    """After an in-app restart the previous copy may hold the port for a moment."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket() as sock:
            if os.name != "nt":  # on Windows this flag would let us share a port that is in use
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((LOCAL_HOST, port))
                return True
            except OSError:
                time.sleep(0.5)
    return False


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="phoneforensics", description="PhoneForensics: point-and-click MVT")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PHONEFORENSICS_PORT", DEFAULT_PORT)))
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser window automatically")
    parser.add_argument("--log-level", default=os.environ.get("PHONEFORENSICS_LOG_LEVEL", "INFO"))
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    logs.configure(args.log_level)
    settings = load_settings()
    settings.cases_dir.mkdir(parents=True, exist_ok=True)
    app = create_app(settings, restart_args=["--port", str(args.port), "--no-browser"])

    url = f"http://{LOCAL_HOST}:{args.port}/"
    if not wait_for_port(args.port):
        print(f"\n  Port {args.port} is busy. Is PhoneForensics already open? Try {url}\n")
        return 1
    print(f"\n  PhoneForensics is running at {url}\n  Keep this window open while you use it. Press Ctrl+C to quit.\n")
    if not args.no_browser:
        threading.Timer(BROWSER_OPEN_DELAY_SECONDS, webbrowser.open, args=[url]).start()
    serve(app, host=LOCAL_HOST, port=args.port, threads=SERVER_THREADS, ident="PhoneForensics")
    return 0
