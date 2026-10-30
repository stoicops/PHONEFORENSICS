"""Turning MVT's output folder into a summary the interface can show, and managing saved checks."""

from __future__ import annotations

import csv
import json
import logging
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, TypedDict

from .config import MAX_DETECTIONS, MAX_LABEL_LENGTH, MAX_NOTES, MAX_RECORDS_PER_LEGACY_FILE, MAX_TIMELINE_ROWS

log = logging.getLogger(__name__)

CASE_FILE = "case.json"
SUMMARY_FILE = "summary.json"
ALERTS_FILE = "alerts.json"
LOG_FILE = "command.log"
TIMELINE_FILES = ("alerts_timeline.csv", "timeline_detected.csv")  # current MVT, then older versions
LEGACY_DETECTED_SUFFIX = "_detected"
NOT_MODULE_RESULTS = frozenset({"info", "case", "summary", "alerts", "urls"})
SEVERE_LEVELS = frozenset({"HIGH", "CRITICAL"})
CASE_ID_PATTERN = re.compile(r"^[\w.-]+$")

Verdict = Literal["detected", "clean", "failed", "incomplete"]


class Finding(TypedDict, total=False):
    module: str
    level: str | None
    message: str | None
    time: str | None
    record: Any


class Summary(TypedDict):
    verdict: Literal["detected", "clean"]
    detections: list[Finding]
    detection_count: int
    modules: list[dict[str, Any]]
    timeline: list[dict[str, str]]
    warnings: list[str]
    files: list[str]
    completed: bool


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        log.warning("unreadable result file", extra={"path": str(path)})
        return None


def _alerts(case_dir: Path) -> tuple[list[Finding], list[Finding]]:
    """Split alerts.json into findings worth showing and lower-level notes."""
    findings: list[Finding] = []
    notes: list[Finding] = []
    data = _read_json(case_dir / ALERTS_FILE) if (case_dir / ALERTS_FILE).exists() else None
    for alert in data if isinstance(data, list) else []:
        if not isinstance(alert, dict):
            continue
        raw_event = alert.get("event")
        event: dict[str, Any] = raw_event if isinstance(raw_event, dict) else {}
        entry: Finding = {
            "module": str(alert.get("module") or ""),
            "level": alert.get("level"),
            "message": alert.get("message"),
            "time": alert.get("event_time"),
            "record": {**event, "matched_indicator": alert.get("matched_indicator")},
        }
        severe = alert.get("level") in SEVERE_LEVELS or alert.get("matched_indicator")
        (findings if severe else notes).append(entry)
    return findings, notes


def summarise(case_dir: Path, completed: bool = True) -> Summary:
    findings, notes = _alerts(case_dir)
    has_alerts_file = (case_dir / ALERTS_FILE).exists()
    modules: list[dict[str, Any]] = []
    for path in sorted(case_dir.glob("*.json")):
        if path.stem in NOT_MODULE_RESULTS:
            continue
        data = _read_json(path)
        if data is None:
            continue
        if path.stem.endswith(LEGACY_DETECTED_SUFFIX):
            if has_alerts_file:
                continue  # already covered by alerts.json
            records = data if isinstance(data, list) else [data]
            module = path.stem[: -len(LEGACY_DETECTED_SUFFIX)]
            findings.extend(
                {"module": module, "level": "HIGH", "record": r} for r in records[:MAX_RECORDS_PER_LEGACY_FILE]
            )
        else:
            modules.append({"name": path.stem, "records": len(data) if isinstance(data, (list, dict)) else 0})

    timeline: list[dict[str, str]] = []
    for name in TIMELINE_FILES:
        timeline_file = case_dir / name
        if timeline_file.exists():
            with timeline_file.open(newline="", encoding="utf-8", errors="replace") as handle:
                timeline = list(csv.DictReader(handle))[:MAX_TIMELINE_ROWS]
            break

    log_lines: list[str] = []
    log_file = case_dir / LOG_FILE
    if log_file.exists():
        for line in log_file.read_text(encoding="utf-8", errors="replace").splitlines():
            if " - WARNING - " in line or " - ERROR - " in line:
                log_lines.append(line.split(" - ", 3)[-1].strip())
    log_lines += [f"[{n.get('level')}] {n.get('module')}: {n.get('message')}" for n in notes]

    return {
        "verdict": "detected" if findings else "clean",
        "detections": findings[:MAX_DETECTIONS],
        "detection_count": len(findings),
        "modules": modules,
        "timeline": timeline,
        "warnings": log_lines[-MAX_NOTES:],
        "files": sorted(p.name for p in case_dir.iterdir() if p.is_file()),
        "completed": completed,
    }


def sanitise_label(label: str) -> str:
    cleaned = " ".join(label.split())[:MAX_LABEL_LENGTH]
    return cleaned or "Phone check"


def new_case_dir(cases_dir: Path, label: str, now: datetime | None = None) -> Path:
    stamp = (now or datetime.now()).strftime("%Y-%m-%d_%H-%M-%S")
    slug = "".join(c if c.isalnum() or c in "-_" else "_" for c in label)[:40] or "check"
    path = cases_dir / f"{stamp}_{slug}"
    suffix = 1
    while path.exists():
        suffix += 1
        path = cases_dir / f"{stamp}_{slug}_{suffix}"
    path.mkdir(parents=True)
    return path


def write_case_meta(case_dir: Path, meta: dict[str, Any]) -> None:
    (case_dir / CASE_FILE).write_text(json.dumps(meta, indent=2), encoding="utf-8")


def save_summary(case_dir: Path, summary: Summary) -> None:
    (case_dir / SUMMARY_FILE).write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")


def load_summary(case_dir: Path) -> Summary:
    saved = _read_json(case_dir / SUMMARY_FILE) if (case_dir / SUMMARY_FILE).exists() else None
    completed = bool(saved.get("completed", True)) if isinstance(saved, dict) else False
    return summarise(case_dir, completed=completed)


def resolve_case(cases_dir: Path, case_id: str) -> Path | None:
    """Return the case folder for an id, refusing anything that could escape `cases_dir`."""
    if not CASE_ID_PATTERN.match(case_id) or case_id in {".", ".."}:
        return None
    path = (cases_dir / case_id).resolve()
    if path.parent != cases_dir.resolve() or not (path / CASE_FILE).is_file():
        return None
    return path


def read_case_meta(case_dir: Path) -> dict[str, Any]:
    meta = _read_json(case_dir / CASE_FILE)
    return meta if isinstance(meta, dict) else {}


def verdict_for(summary: Summary) -> Verdict:
    if summary["verdict"] == "detected":
        return "detected"
    return "clean" if summary["completed"] else "failed"


def delete_case(case_dir: Path) -> None:
    """Permanently remove a check and everything saved with it (data disposal, MVT License §3.0)."""
    shutil.rmtree(case_dir)


def remove_decrypted_copy(case_dir: Path, folder_name: str) -> None:
    """The decrypted backup is only needed while MVT runs; keeping it would retain far more phone data."""
    decrypted = case_dir / folder_name
    if decrypted.is_dir():
        shutil.rmtree(decrypted, ignore_errors=True)


def list_cases(cases_dir: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    if not cases_dir.is_dir():
        return cases
    for path in sorted(cases_dir.iterdir(), reverse=True):
        if not (path / CASE_FILE).is_file():
            continue
        summary = load_summary(path)
        cases.append(
            {
                "id": path.name,
                **read_case_meta(path),
                "verdict": verdict_for(summary),
                "detection_count": summary["detection_count"],
            }
        )
    return cases
