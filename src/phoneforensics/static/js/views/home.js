import { api, errorMessage } from "../api.js";
import { find, icon, maybe, toast } from "../dom.js";
import { formatDate } from "../format.js";
import { html, setHtml } from "../html.js";
import { footer, note, ring } from "./shared.js";

/** @typedef {import("../api.js").UpdateReport} UpdateReport */

/** Remembered for the session so the background check only runs once. @type {UpdateReport | null} */
let lastReport = null;

/** @type {import("../main.js").RenderView} */
export async function render(view, _arg, ctx) {
  const [cases] = await Promise.all([api.cases(), ctx.refreshStatus()]);
  const { status } = ctx;
  const flagged = cases.filter((c) => c.verdict === "detected").length;
  const lists = status.iocs.count;
  setHtml(
    view,
    html`
    <section class="pf-welcome" aria-labelledby="welcomeTitle">
      <h1 class="pf-welcome__title" id="welcomeTitle">Is someone spying on your phone?</h1>
      <p class="pf-welcome__text">PhoneForensics checks iPhones and Android phones for traces of known spyware, such as Pegasus and Predator. It uses the Mobile Verification Toolkit from Amnesty International. Everything stays on this computer.</p>
      <div class="pf-row"><a class="pf-btn pf-btn--primary pf-btn--lg" href="#/scan">Start a new check ${icon("chev-r")}</a><a class="pf-btn pf-btn--quiet" href="#/help">How does it work?</a></div>
    </section>
    ${status.mvt ? "" : note(html`MVT is not installed. Run <code>pip install mvt</code> and start PhoneForensics again.`)}
    ${lists ? "" : note(html`<b>First time?</b> Download the spyware lists before your first check. Without them we cannot recognise known spyware.`)}
    <div class="pf-grid-3">
      <div class="pf-stat"><p class="pf-stat__value">${lists}</p><p class="pf-stat__label">Spyware lists${status.iocs.updated ? `, updated ${formatDate(status.iocs.updated)}` : ""}</p>
        <button class="pf-btn pf-mt-4" type="button" id="updateLists">${icon(lists ? "refresh" : "download")}${lists ? "Update lists" : "Download lists"}</button></div>
      <div class="pf-stat"><p class="pf-stat__value">${cases.length}</p><p class="pf-stat__label">Checks on this computer</p>
        <a class="pf-btn pf-btn--quiet pf-mt-4" href="#/cases">See past checks</a></div>
      <div class="pf-stat ${flagged ? "pf-stat--attention" : "pf-stat--clear"}"><p class="pf-stat__value">${flagged}</p><p class="pf-stat__label">Checks with something to look at</p></div>
    </div>
    <section class="pf-card pf-stack" aria-labelledby="updatesTitle">
      <div class="pf-head"><div><h2 class="pf-h2" id="updatesTitle">Updates</h2><p class="pf-muted">PhoneForensics ${status.version} · MVT ${status.mvt ?? "not installed"}</p></div>
        <button class="pf-btn" type="button" id="checkUpdates">${icon("refresh")}Check for updates</button></div>
      <div id="updateResult" aria-live="polite"></div>
    </section>
    ${footer()}`,
  );

  find("#updateLists", HTMLButtonElement, view).addEventListener("click", async () => {
    try {
      location.hash = `#/job/${(await api.updateIndicators()).id}`;
    } catch (error) {
      toast(errorMessage(error));
    }
  });
  find("#checkUpdates", HTMLButtonElement, view).addEventListener("click", () => void checkUpdates(view, true));
  if (lastReport) renderUpdates(view, lastReport, false);
  else void checkUpdates(view, false);
}

/** @param {HTMLElement} view @param {boolean} manual */
async function checkUpdates(view, manual) {
  const out = maybe("#updateResult", HTMLElement, view);
  if (manual && out) setHtml(out, html`<p class="pf-muted pf-m0">Checking…</p>`);
  try {
    lastReport = await api.checkUpdates();
  } catch (error) {
    if (manual && out) setHtml(out, html`<p class="pf-muted pf-m0">${errorMessage(error)}</p>`);
    return;
  }
  renderUpdates(view, lastReport, manual);
}

/** @param {HTMLElement} view @param {UpdateReport} report @param {boolean} manual */
function renderUpdates(view, report, manual) {
  const out = maybe("#updateResult", HTMLElement, view);
  if (!out) return; // the user navigated away
  const { app, mvt, method, errors } = report;
  if (!app.available && !mvt.available) {
    setHtml(
      out,
      manual
        ? html`<span class="pf-badge pf-badge--clear">${icon("check")}Everything is up to date</span>
          ${errors.length ? html`<p class="pf-field__help">${errors.join(" ")}</p>` : ""}`
        : html``,
    );
    return;
  }
  const lines = [];
  if (app.available)
    lines.push(
      method === "git"
        ? `A new version of PhoneForensics is ready (${app.latest}).`
        : `PhoneForensics ${app.latest} is available.`,
    );
  if (mvt.available) lines.push(`MVT ${mvt.latest} is available${mvt.current ? ` (you have ${mvt.current})` : ""}.`);
  const download = app.available && method !== "git";
  setHtml(
    out,
    note(
      html`<div class="pf-stack-sm"><p class="pf-m0">${lines.join(" ")}</p><div class="pf-row">
        ${download ? html`<a class="pf-btn pf-btn--primary" href="${app.url}" target="_blank" rel="noopener noreferrer">${icon("download")}Download the new version</a>` : ""}
        ${!download || mvt.available ? html`<button class="pf-btn ${download ? "" : "pf-btn--primary"}" type="button" id="applyUpdates">${icon("download")}${download ? "Update MVT only" : "Update now"}</button>` : ""}
      </div></div>`,
      "download",
    ),
  );
  maybe("#applyUpdates", HTMLButtonElement, out)?.addEventListener("click", async () => {
    try {
      lastReport = null;
      location.hash = `#/job/${(await api.applyUpdates()).id}`;
    } catch (error) {
      toast(errorMessage(error));
    }
  });
}

/** Shown while the server restarts after an update; reloads once it answers again. @param {HTMLElement} view */
export async function restartApp(view) {
  await api.restart();
  setHtml(
    view,
    html`<section class="pf-card pf-pad"><div class="pf-scan">${ring()}
      <h2 class="pf-scan__title">Restarting PhoneForensics…</h2><p class="pf-scan__text">This page will reload by itself in a few seconds.</p></div></section>`,
  );
  const RETRIES = 30;
  const WAIT_MS = 1000;
  await new Promise((resolve) => setTimeout(resolve, 2 * WAIT_MS));
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      await api.status();
      location.hash = "#/";
      location.reload();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    }
  }
  setHtml(
    view,
    note("PhoneForensics did not come back by itself. Close the black window and open PhoneForensics again."),
  );
}
