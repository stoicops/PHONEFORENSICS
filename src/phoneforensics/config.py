"""Settings and constants. Values that users may change come from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
STATIC_DIR = PACKAGE_DIR / "static"

DEFAULT_PORT = 8765
LOCAL_HOST = "127.0.0.1"
ALLOWED_HOSTS = frozenset({"127.0.0.1", "localhost"})

# Where new versions of PhoneForensics are published.
UPDATE_REPO = "stoicops/PHONEFORENSICS"  # exact casing GitHub uses in its links
RELEASES_URL = f"https://github.com/{UPDATE_REPO}/releases"
LATEST_RELEASE_API = f"https://api.github.com/repos/{UPDATE_REPO}/releases/latest"
MVT_PYPI_API = "https://pypi.org/pypi/mvt/json"
DEFAULT_SUPPORT_URL = "https://buymeacoffee.com/surinder"

HTTP_TIMEOUT_SECONDS = 8
GIT_TIMEOUT_SECONDS = 60
PORT_WAIT_SECONDS = 20
SSE_KEEPALIVE_SECONDS = 15
SERVER_THREADS = 16  # each open progress page holds one thread for its event stream

# Caps that keep responses small even for very large MVT outputs.
MAX_DETECTIONS = 500
MAX_RECORDS_PER_LEGACY_FILE = 200
MAX_TIMELINE_ROWS = 500
MAX_NOTES = 200
MAX_BROWSE_ENTRIES = 1000
MAX_LABEL_LENGTH = 80
MAX_PASSWORD_LENGTH = 1024
MAX_PATH_LENGTH = 4096


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    support_url: str

    @property
    def cases_dir(self) -> Path:
        return self.data_dir / "cases"


def load_settings(environ: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if environ is None else environ)
    data_dir = Path(env.get("PHONEFORENSICS_HOME") or Path.home() / "PhoneForensics").expanduser()
    support_url = env.get("PHONEFORENSICS_SUPPORT_URL", DEFAULT_SUPPORT_URL).strip()
    if support_url and not support_url.startswith("https://"):
        support_url = ""  # only https links are shown in the app
    return Settings(data_dir=data_dir, support_url=support_url)
