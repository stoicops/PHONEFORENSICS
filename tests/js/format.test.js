import assert from "node:assert/strict";
import { test } from "node:test";
import {
  areaOf,
  formatDate,
  moduleFromLogLine,
  plural,
  prettyName,
  stageText,
} from "../../src/phoneforensics/static/js/format.js";

test("areaOf maps MVT modules to plain language", () => {
  assert.equal(areaOf("sms"), "text messages");
  assert.equal(areaOf("SafariHistory"), "browsing history");
  assert.equal(areaOf("mvt.android.modules.androidqf.packages"), "installed apps");
  assert.equal(areaOf("somethingNew"), "phone data");
});

test("moduleFromLogLine reads the module name", () => {
  assert.equal(moduleFromLogLine("[mvt.ios.modules.mixed.sms] Running module"), "sms");
  assert.equal(moduleFromLogLine("[mvt.android.modules.bugreport.packages] x"), "packages");
  assert.equal(moduleFromLogLine("[mvt.android.cmd_check_bugreport] Parsing STIX2"), null);
});

test("stageText conjugates by state", () => {
  assert.equal(stageText("Load the latest spyware lists", "done"), "Loaded the latest spyware lists");
  assert.equal(stageText("Check text messages", "current"), "Checking text messages");
  assert.equal(stageText("Check text messages", "todo"), "Check text messages");
  assert.equal(stageText("Think about it", "done"), "Think about it");
});

test("prettyName and plural", () => {
  assert.equal(prettyName("safari_history"), "Safari history");
  assert.equal(prettyName("SafariBrowserState"), "Safari browser state");
  assert.equal(plural(1, "thing"), "1 thing");
  assert.equal(plural(3, "thing"), "3 things");
});

test("formatDate handles empty and invalid input", () => {
  assert.equal(formatDate(null), "");
  assert.equal(formatDate("not a date"), "not a date");
  assert.match(formatDate("2026-10-30T09:00:00"), /2026/);
});
