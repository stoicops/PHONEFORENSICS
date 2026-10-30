from __future__ import annotations

from datetime import datetime
from pathlib import Path

from conftest import make_case

from phoneforensics import results

ALERT = {
    "level": "CRITICAL",
    "module": "mvt.ios.modules.mixed.sms",
    "message": "Found a known malicious domain",
    "event_time": "2026-09-12 14:03:11",
    "event": {"text": "hello"},
    "matched_indicator": {"ioc": {"value": "bad.example", "name": "Pegasus"}},
}


def test_clean_case_lists_modules_and_no_findings(tmp_path: Path) -> None:
    case = make_case(tmp_path, "c", {"sms.json": [1, 2, 3], "safari_history.json": {"a": 1}, "info.json": {}})
    summary = results.summarise(case)
    assert summary["verdict"] == "clean"
    assert summary["detection_count"] == 0
    assert {m["name"]: m["records"] for m in summary["modules"]} == {"safari_history": 1, "sms": 3}


def test_severe_alert_is_a_finding_and_low_alert_is_a_note(tmp_path: Path) -> None:
    low = {**ALERT, "level": "LOW", "matched_indicator": None, "message": "Just so you know"}
    case = make_case(tmp_path, "c", {"alerts.json": [ALERT, low]})
    summary = results.summarise(case)
    assert summary["verdict"] == "detected"
    assert summary["detection_count"] == 1
    finding = summary["detections"][0]
    assert finding["level"] == "CRITICAL"
    assert finding["record"]["matched_indicator"]["ioc"]["value"] == "bad.example"
    assert any("Just so you know" in note for note in summary["warnings"])


def test_legacy_detected_files_are_findings_when_no_alerts_file(tmp_path: Path) -> None:
    case = make_case(tmp_path, "c", {"sms_detected.json": [{"text": "x"}, {"text": "y"}], "sms.json": [1]})
    summary = results.summarise(case)
    assert summary["detection_count"] == 2
    assert summary["detections"][0]["module"] == "sms"


def test_legacy_files_ignored_when_alerts_file_exists(tmp_path: Path) -> None:
    case = make_case(tmp_path, "c", {"alerts.json": [], "sms_detected.json": [{"text": "x"}]})
    assert results.summarise(case)["detection_count"] == 0


def test_malformed_files_do_not_break_the_summary(tmp_path: Path) -> None:
    case = make_case(tmp_path, "c", {"alerts.json": "{not json", "sms.json": "nope", "other.json": [1]})
    summary = results.summarise(case)
    assert summary["verdict"] == "clean"
    assert [m["name"] for m in summary["modules"]] == ["other"]


def test_alerts_with_unexpected_shapes_are_skipped(tmp_path: Path) -> None:
    case = make_case(tmp_path, "c", {"alerts.json": ["text", {"level": "HIGH", "event": "not a dict"}]})
    summary = results.summarise(case)
    assert summary["detection_count"] == 1
    assert summary["detections"][0]["record"] == {"matched_indicator": None}


def test_timeline_and_log_warnings_are_read(tmp_path: Path) -> None:
    case = make_case(
        tmp_path,
        "c",
        {
            "alerts_timeline.csv": '"Event Time","Module","Message","Event"\n"2026","sms","bad","{}"\n',
            "command.log": "2026 - mvt - INFO - fine\n2026 - mvt - WARNING - Something odd\n",
        },
    )
    summary = results.summarise(case)
    assert summary["timeline"] == [{"Event Time": "2026", "Module": "sms", "Message": "bad", "Event": "{}"}]
    assert summary["warnings"] == ["Something odd"]


def test_load_summary_reads_completion_flag(tmp_path: Path) -> None:
    case = make_case(tmp_path, "c", {"sms.json": [1]})
    assert results.load_summary(case)["completed"] is False  # no summary.json: never finished
    results.save_summary(case, results.summarise(case, completed=True))
    assert results.load_summary(case)["completed"] is True


def test_list_cases_reports_verdicts_newest_first(tmp_path: Path) -> None:
    old = make_case(tmp_path, "2026-01-01_a", {"sms.json": [1]})
    results.save_summary(old, results.summarise(old))
    new = make_case(tmp_path, "2026-02-01_b", {"alerts.json": [ALERT]})
    results.save_summary(new, results.summarise(new))
    make_case(tmp_path, "2026-03-01_c", {})  # never finished
    (tmp_path / "not-a-case").mkdir()
    listed = results.list_cases(tmp_path)
    assert [(c["id"], c["verdict"]) for c in listed] == [
        ("2026-03-01_c", "failed"),
        ("2026-02-01_b", "detected"),
        ("2026-01-01_a", "clean"),
    ]


def test_list_cases_without_folder_is_empty(tmp_path: Path) -> None:
    assert results.list_cases(tmp_path / "missing") == []


def test_resolve_case_blocks_path_traversal(tmp_path: Path) -> None:
    make_case(tmp_path / "cases", "real", {})
    (tmp_path / "secret").mkdir()
    (tmp_path / "secret" / "case.json").write_text("{}")
    cases = tmp_path / "cases"
    assert results.resolve_case(cases, "real") == (cases / "real").resolve()
    for bad in ["..", ".", "../secret", "real/../../secret", "", "a\\b", "missing"]:
        assert results.resolve_case(cases, bad) is None, bad


def test_sanitise_label() -> None:
    assert results.sanitise_label("  Maria's   iPhone ") == "Maria's iPhone"
    assert results.sanitise_label("   ") == "Phone check"
    assert len(results.sanitise_label("x" * 500)) == 80


def test_new_case_dir_is_unique_and_filesystem_safe(tmp_path: Path) -> None:
    now = datetime(2026, 1, 2, 3, 4, 5)
    first = results.new_case_dir(tmp_path, "Maria's iPhone/../x", now)
    second = results.new_case_dir(tmp_path, "Maria's iPhone/../x", now)
    assert first.name == "2026-01-02_03-04-05_Maria_s_iPhone____x"
    assert second.name.endswith("_2")
    assert first.parent == second.parent == tmp_path
