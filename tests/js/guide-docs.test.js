import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderGuides } from "../../scripts/guide-docs.js";

test("docs/SAVING-PHONE-DATA.md matches the in-app guides", () => {
  const onDisk = readFileSync(new URL("../../docs/SAVING-PHONE-DATA.md", import.meta.url), "utf8");
  assert.equal(onDisk, renderGuides(), "Run: node scripts/guide-docs.js > docs/SAVING-PHONE-DATA.md");
});
