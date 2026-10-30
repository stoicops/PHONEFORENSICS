// End-to-end tests against the real server (waitress) in a real browser.
// Run with: npm run test:e2e   (needs the Python virtualenv and a Playwright Chromium)

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const PYTHON =
  process.env.PF_PYTHON ?? (process.platform === "win32" ? ".venv\\Scripts\\python.exe" : ".venv/bin/python");
const PORT = 18765 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}/`;
const DEMO_CASE = "2026-10-30_09-00-00_Demo";

/** @type {import("node:child_process").ChildProcess} */
let server;
/** @type {import("playwright").Browser} */
let browser;
let home = "";
let bugreport = "";

function seedDemoCase() {
  const folder = join(home, "cases", DEMO_CASE);
  mkdirSync(folder, { recursive: true });
  const write = (name, data) => writeFileSync(join(folder, name), JSON.stringify(data));
  write("case.json", {
    label: "Demo <b>iPhone</b>",
    type: "ios-backup",
    source: "/x",
    created: "2026-10-30T09:00:00",
    demo: true,
  });
  write("sms.json", [{}, {}]);
  write("summary.json", { completed: true });
  write("alerts.json", [
    {
      level: "CRITICAL",
      module: "mvt.ios.modules.mixed.sms",
      message: "Found a known malicious domain <script>alert(1)</script>",
      event_time: "2026-09-12 14:03:11",
      event: { text: "https://bad.example/track" },
      matched_indicator: { ioc: { value: "bad.example", name: "Pegasus" } },
    },
  ]);
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}api/status`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
}

before(async () => {
  home = mkdtempSync(join(tmpdir(), "pf-e2e-"));
  seedDemoCase();
  bugreport = join(home, "bugreport.zip");
  const zip = spawnSync(PYTHON, [
    "-c",
    "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('dumpstate.txt','== dumpstate: 2026\\n'); z.close()",
    bugreport,
  ]);
  assert.equal(zip.status, 0, String(zip.stderr));
  server = spawn(PYTHON, ["-m", "phoneforensics", "--port", String(PORT), "--no-browser", "--log-level", "WARNING"], {
    env: { ...process.env, PHONEFORENSICS_HOME: home },
    stdio: "inherit",
  });
  await waitForServer();
  browser = await chromium.launch(process.env.PF_CHROMIUM ? { executablePath: process.env.PF_CHROMIUM } : {});
});

after(async () => {
  await browser?.close();
  server?.kill();
  rmSync(home, { recursive: true, force: true });
});

/** @param {{ colorScheme?: "light" | "dark", width?: number }} [options] */
async function openPage(options = {}) {
  const context = await browser.newContext({
    colorScheme: options.colorScheme ?? "light",
    viewport: { width: options.width ?? 1280, height: 900 },
    bypassCSP: false,
  });
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (!request.url().startsWith(BASE)) errors.push(`external request: ${request.url()}`);
  });
  return { page, errors, close: () => context.close() };
}

/** Run axe in an isolated world (the page CSP forbids injected scripts in the main world). @param {import("playwright").Page} page */
async function axeViolations(page) {
  const session = await page.context().newCDPSession(page);
  const { executionContextId } = await new Promise((resolve) => {
    session.on("Runtime.executionContextCreated", ({ context }) => {
      if (context.name === "axe") resolve({ executionContextId: context.id });
    });
    void session.send("Runtime.enable").then(async () => {
      const { frameTree } = await session.send("Page.getFrameTree");
      await session.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "axe" });
    });
  });
  const source = require("node:fs").readFileSync(AXE_PATH, "utf8");
  await session.send("Runtime.evaluate", { expression: source, contextId: executionContextId });
  const { result } = await session.send("Runtime.evaluate", {
    expression:
      "axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }).then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target.join(' ')).slice(0, 3) }))))",
    contextId: executionContextId,
    awaitPromise: true,
    returnByValue: true,
  });
  return /** @type {{ id: string, impact: string, nodes: string[] }[]} */ (JSON.parse(result.value));
}

const SCREENS = [
  ["home", "#/", "Is someone spying on your phone?"],
  ["guide", "#/help", "How to save data from the phone"],
  ["guide detail", "#/help/iphone-mac", "iPhone backup on a Mac"],
  ["past checks", "#/cases", "Past checks"],
  ["result", `#/case/${DEMO_CASE}`, "matched known spyware"],
  ["wizard", "#/scan", "Which kind of phone are you checking?"],
];

describe("screens", () => {
  for (const scheme of /** @type {const} */ (["light", "dark"])) {
    for (const [name, hash, text] of SCREENS) {
      test(`${name} (${scheme}) renders with no accessibility violations`, async () => {
        const { page, errors, close } = await openPage({ colorScheme: scheme });
        await page.goto(BASE + hash);
        await page.locator("#view").getByText(text).first().waitFor();
        const violations = await axeViolations(page);
        await close();
        assert.deepEqual(violations, [], `${name}: ${JSON.stringify(violations, null, 1)}`);
        assert.deepEqual(errors, []);
      });
    }
  }

  for (const [name, hash, text] of SCREENS) {
    test(`${name} fits a phone screen without sideways scrolling`, async () => {
      const { page, close } = await openPage({ width: 360 });
      await page.goto(BASE + hash);
      await page.locator("#view").getByText(text).first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await close();
      assert.ok(overflow <= 0, `${name} overflows by ${overflow}px`);
    });
  }
});

describe("behaviour", () => {
  test("MVT output is shown as text, never as markup", async () => {
    const { page, close } = await openPage();
    await page.goto(`${BASE}#/case/${DEMO_CASE}`);
    await page.getByText("<script>alert(1)</script>", { exact: false }).waitFor();
    assert.equal(await page.locator("#view script").count(), 0);
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Demo <b>iPhone</b> Example data");
    await close();
  });

  test("result tabs work with the keyboard", async () => {
    const { page, close } = await openPage();
    await page.goto(`${BASE}#/case/${DEMO_CASE}`);
    const matches = page.getByRole("tab", { name: /Matches/ });
    await matches.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: "What was checked" }).getAttribute("aria-selected"), "true");
    assert.ok(await page.getByRole("tabpanel").filter({ hasText: "Text messages" }).isVisible());
    await close();
  });

  test("a check cannot start without consent, then runs end to end", async () => {
    const { page, errors, close } = await openPage();
    await page.goto(`${BASE}#/scan`);
    await page.getByText("Android", { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Bug report", { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Where is the bug report .zip?").fill(bugreport);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Give this check a name").fill("E2E phone");
    const start = page.getByRole("button", { name: "Start check" });
    assert.equal(await start.isDisabled(), true);
    await page.getByText("What is kept, and for how long").waitFor();
    await page.getByLabel("The person whose data is on this phone has agreed to this check").check();
    await start.click();
    await page.waitForURL(/#\/case\//, { timeout: 60_000 });
    await page.getByRole("heading", { name: /No known spyware found|could not read/ }).waitFor();
    await page.goto(`${BASE}#/cases`);
    await page.getByText("E2E phone").waitFor();

    // Data disposal: the check can be deleted, with a confirmation step.
    await page.getByText("E2E phone").click();
    await page.getByRole("button", { name: "Delete this check" }).click();
    await page.getByRole("button", { name: "Yes, delete it" }).click();
    await page.waitForURL(/#\/cases$/);
    await page.getByRole("heading", { name: "Past checks" }).waitFor();
    assert.equal(await page.getByText("E2E phone").count(), 0);
    await close();
    assert.deepEqual(errors, []);
  });

  test("the folder picker opens, traps focus and closes with Escape", async () => {
    const { page, close } = await openPage();
    await page.goto(`${BASE}#/scan`);
    await page.getByText("iPhone", { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("iPhone backup", { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    const chooser = page.getByRole("button", { name: "Choose folder" });
    await chooser.click();
    const dialog = page.getByRole("dialog", { name: "Choose the backup folder" });
    await dialog.waitFor();
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)), "focus escaped the dialog");
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false);
    assert.ok(await chooser.evaluate((el) => el === document.activeElement), "focus not returned to the opener");
    await close();
  });

  test("the skip link moves focus to the main content", async () => {
    const { page, close } = await openPage();
    await page.goto(BASE);
    await page.getByText("Is someone spying on your phone?").waitFor();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Skip to main content");
    await close();
  });

  test("an unknown result shows a friendly error", async () => {
    const { page, close } = await openPage();
    await page.goto(`${BASE}#/case/does-not-exist`);
    await page.getByRole("alert").getByText("That check could not be found.").waitFor();
    await close();
  });
});
