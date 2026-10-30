// The result of one check: verdict, next steps, and the details behind it.

import { api, errorMessage } from "../api.js";
import { LINKS, NEXT_STEPS, TYPE_NAMES } from "../content.js";
import { find, findAll, icon, toast } from "../dom.js";
import { areaOf, formatDate, plural, prettyName } from "../format.js";
import { html, setHtml } from "../html.js";
import { emptyState, footer, stepList } from "./shared.js";

/** @typedef {import("../api.js").CaseDetail} CaseDetail */
/** @typedef {import("../api.js").Finding} Finding */
/** @typedef {"attention" | "clear" | "failed"} Outcome */
/** @typedef {"det" | "mod" | "tl" | "warn" | "files"} Tab */

const MAX_FIELDS_PER_FINDING = 6;
const MAX_FIELD_LENGTH = 300;

/** @param {CaseDetail} c @returns {Outcome} */
export function outcomeOf(c) {
  const s = c.summary;
  if (s.detections.length) return "attention";
  return s.completed === false || !s.modules.length ? "failed" : "clear";
}

/** @param {Outcome} outcome @param {number} count */
function heroContent(outcome, count) {
  switch (outcome) {
    case "attention":
      return {
        mark: "shield-alert",
        eyebrow: "Something to look at",
        title: `${plural(count, "thing")} matched known spyware`,
        body: "This is not proof that the phone is infected. Some matches turn out to be harmless. An expert can tell you for sure, and the steps below keep the evidence safe until then.",
        actions: html`<a class="pf-btn pf-btn--primary pf-btn--lg" href="${LINKS.accessNow}" target="_blank" rel="noopener noreferrer">Get free expert help</a><button class="pf-btn pf-btn--lg" type="button" data-goto="det">See what matched</button>`,
      };
    case "clear":
      return {
        mark: "shield-check",
        eyebrow: "Check finished",
        title: "No known spyware found",
        body: "Nothing on this phone matched the spyware lists we used. No tool can promise a phone is clean, because new spyware may not be on the lists yet.",
        actions: html`<a class="pf-btn pf-btn--primary pf-btn--lg" href="#/">Done</a>`,
      };
    default:
      return {
        mark: "info",
        eyebrow: "Check did not finish",
        title: "We could not read the phone data",
        body: "This usually means the wrong folder was chosen or the backup password was not right. Nothing about the phone itself is known yet.",
        actions: html`<a class="pf-btn pf-btn--primary pf-btn--lg" href="#/scan">Try again</a><button class="pf-btn pf-btn--lg" type="button" data-goto="warn">Show what went wrong</button>`,
      };
  }
}

/** @param {Finding} finding */
function findingView(finding) {
  const record = finding.record ?? {};
  const matched = record.matched_indicator;
  const indicator = matched?.ioc ?? matched;
  const fields = Object.entries(record)
    .filter(([key, value]) => key !== "matched_indicator" && value !== null && value !== "")
    .slice(0, MAX_FIELDS_PER_FINDING);
  const level = (finding.level ?? "high").toLowerCase();
  return html`<article class="pf-finding">
    <h3 class="pf-finding__title">${finding.message || "Matched a known spyware sign"}</h3>
    <span class="pf-badge ${level === "critical" ? "pf-badge--critical" : "pf-badge--attention"}">${level.charAt(0).toUpperCase() + level.slice(1)}</span>
    <p class="pf-finding__meta">Found in ${areaOf(finding.module)}${finding.time ? ` · ${formatDate(finding.time)}` : ""}</p>
    ${indicator?.value ? html`<p class="pf-finding__body">Matches <b>${indicator.value}</b>${indicator.name ? html`, linked to <b>${indicator.name}</b>` : ""}.</p>` : ""}
    ${fields.length ? html`<div class="pf-finding__match pf-mono">${fields.map(([key, value]) => html`<div><span class="pf-muted">${key}:</span> ${(typeof value === "object" ? JSON.stringify(value) : String(value)).slice(0, MAX_FIELD_LENGTH)}</div>`)}</div>` : ""}
  </article>`;
}

/** @param {CaseDetail} c @param {string} id */
function panels(c, id) {
  const s = c.summary;
  return {
    det: () =>
      s.detections.length
        ? html`<div class="pf-stack-sm">${s.detections.map(findingView)}</div>`
        : emptyState("Nothing matched the spyware lists.", "shield-check"),
    mod: () =>
      s.modules.length
        ? html`<div class="pf-table-wrap"><table class="pf-table"><caption class="pf-visually-hidden">Parts of the phone that were checked</caption>
          <thead><tr><th scope="col">Part of the phone</th><th scope="col">What it is</th><th scope="col">Items</th></tr></thead><tbody>
          ${s.modules.map((m) => html`<tr><td>${prettyName(m.name)}</td><td class="pf-muted">${areaOf(m.name)}</td><td>${m.records.toLocaleString()}</td></tr>`)}</tbody></table></div>`
        : html`<p class="pf-muted">Nothing was read.</p>`,
    tl: () => {
      const first = s.timeline[0];
      if (!first) return html`<p class="pf-muted">No events to show.</p>`;
      const columns = Object.keys(first);
      return html`<div class="pf-table-wrap"><table class="pf-table"><caption class="pf-visually-hidden">Timeline of matches</caption>
        <thead><tr>${columns.map((k) => html`<th scope="col">${k}</th>`)}</tr></thead><tbody>
        ${s.timeline.map((row) => html`<tr>${columns.map((k) => html`<td>${row[k]}</td>`)}</tr>`)}</tbody></table></div>`;
    },
    warn: () =>
      s.warnings.length
        ? html`<div class="pf-log pf-log--tall" tabindex="0">${s.warnings.join("\n")}</div>`
        : html`<p class="pf-muted">No notes.</p>`,
    files: () =>
      html`<p class="pf-muted">The raw results from MVT. Share these with an expert if you ask for help. They are saved in <span class="pf-mono">${c.path}</span>.</p>
      <ul class="pf-bullets">${s.files.map((f) => html`<li><a class="pf-link" href="${api.caseFileUrl(id, f)}">${f}</a></li>`)}</ul>`,
  };
}

/** @type {import("../main.js").RenderView} */
export async function render(view, id) {
  const c = await api.case(id);
  const s = c.summary;
  const outcome = outcomeOf(c);
  const hero = heroContent(outcome, s.detection_count);
  const records = s.modules.reduce((sum, m) => sum + m.records, 0);
  /** @type {[Tab, string][]} */
  const tabs = [
    ["det", `Matches (${s.detection_count})`],
    ["mod", "What was checked"],
    ["tl", `Timeline (${s.timeline.length})`],
    ["warn", `Notes (${s.warnings.length})`],
    ["files", "Files"],
  ];
  setHtml(
    view,
    html`
    <div class="pf-head"><div><a class="pf-page__back" href="#/cases">← Past checks</a>
      <h1 class="pf-page__title">${c.label} ${c.demo ? html`<span class="pf-demo-tag">Example data</span>` : ""}</h1>
      <p class="pf-muted">${TYPE_NAMES[c.type] ?? c.type} · Checked ${formatDate(c.created)}</p></div>
      <div class="pf-row"><button class="pf-btn" type="button" id="printReport">${icon("print")}Print report</button><button class="pf-btn" type="button" id="openFolder">${icon("folder")}Open folder</button></div></div>
    <section class="pf-hero ${outcome === "attention" ? "pf-hero--attention" : outcome === "clear" ? "pf-hero--clear" : ""}" aria-labelledby="heroTitle">
      <div class="pf-hero__mark">${icon(hero.mark, "pf-icon-lg")}</div>
      <div><p class="pf-hero__eyebrow">${hero.eyebrow}</p><h2 class="pf-hero__title" id="heroTitle">${hero.title}</h2><p class="pf-hero__body">${hero.body}</p>
        <div class="pf-hero__actions">${hero.actions}</div></div>
    </section>
    <section aria-labelledby="nextTitle"><h2 class="pf-section-title" id="nextTitle">What to do now</h2>${stepList(NEXT_STEPS[outcome])}</section>
    <div class="pf-grid-3">
      <div class="pf-stat"><p class="pf-stat__value">${s.modules.length}</p><p class="pf-stat__label">Parts of the phone checked</p></div>
      <div class="pf-stat"><p class="pf-stat__value">${records.toLocaleString()}</p><p class="pf-stat__label">Items looked at</p></div>
      <div class="pf-stat ${s.detection_count ? "pf-stat--attention" : "pf-stat--clear"}"><p class="pf-stat__value">${s.detection_count}</p><p class="pf-stat__label">Matches to look at</p></div>
    </div>
    <section id="details" aria-labelledby="detailsTitle"><h2 class="pf-section-title" id="detailsTitle">Details</h2>
      <div class="pf-tabs" role="tablist" aria-labelledby="detailsTitle">
        ${tabs.map(([key, label]) => html`<button class="pf-tab" type="button" role="tab" id="tab-${key}" aria-controls="panel-${key}" aria-selected="false" tabindex="-1" data-tab="${key}">${label}</button>`)}
      </div>
      ${tabs.map(([key]) => html`<div class="pf-tabpanel" role="tabpanel" id="panel-${key}" aria-labelledby="tab-${key}" tabindex="0" hidden></div>`)}
    </section>
    <section class="pf-card pf-stack" aria-labelledby="deleteTitle">
      <h2 class="pf-h2" id="deleteTitle">Delete this check</h2>
      <p class="pf-muted">Removes the results and everything saved with them from this computer. It does not delete the phone backup or collection itself.</p>
      <div class="pf-row" id="deleteArea"><button class="pf-btn" type="button" id="deleteCase">Delete this check</button></div>
    </section>
    ${footer()}`,
  );

  const content = panels(c, id);
  const tabButtons = findAll("[role=tab]", HTMLButtonElement, view);
  /** @param {Tab} tab */
  const fill = (tab) => {
    const panel = find(`#panel-${tab}`, HTMLElement, view);
    if (!panel.childElementCount) setHtml(panel, content[tab]());
    return panel;
  };
  /** @param {Tab} tab @param {{ scroll?: boolean, focus?: boolean }} [options] */
  const show = (tab, options = {}) => {
    for (const button of tabButtons) {
      const selected = button.dataset.tab === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && options.focus) button.focus();
    }
    for (const panel of findAll("[role=tabpanel]", HTMLElement, view)) panel.hidden = panel.id !== `panel-${tab}`;
    fill(tab);
    if (options.scroll) find("#details", HTMLElement, view).scrollIntoView({ behavior: "smooth" });
  };
  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => show(/** @type {Tab} */ (button.dataset.tab)));
    // Arrow keys move between tabs (WAI-ARIA tabs pattern).
    button.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      const next = tabButtons[(index + step + tabButtons.length) % tabButtons.length];
      if (next) show(/** @type {Tab} */ (next.dataset.tab), { focus: true });
    });
  });
  for (const button of findAll("[data-goto]", HTMLButtonElement, view)) {
    button.addEventListener("click", () => show(/** @type {Tab} */ (button.dataset.goto), { scroll: true }));
  }
  show(s.detection_count ? "det" : outcome === "failed" ? "warn" : "mod");

  find("#printReport", HTMLButtonElement, view).addEventListener("click", () => {
    for (const [key] of tabs) fill(key);
    window.print();
  });
  find("#deleteCase", HTMLButtonElement, view).addEventListener("click", () => confirmDelete(view, id));
  find("#openFolder", HTMLButtonElement, view).addEventListener("click", () => {
    api.openCaseFolder(id).catch((error) => toast(errorMessage(error)));
  });
}

/** Two-step delete so it cannot happen by accident. @param {HTMLElement} view @param {string} id */
function confirmDelete(view, id) {
  const area = find("#deleteArea", HTMLElement, view);
  setHtml(
    area,
    html`<p class="pf-m0" role="alert"><b>Delete this check permanently?</b> This cannot be undone.</p>
    <button class="pf-btn pf-btn--danger" type="button" id="confirmDelete">Yes, delete it</button>
    <button class="pf-btn pf-btn--quiet" type="button" id="cancelDelete">Cancel</button>`,
  );
  const yes = find("#confirmDelete", HTMLButtonElement, area);
  yes.focus();
  yes.addEventListener("click", async () => {
    yes.disabled = true;
    try {
      await api.deleteCase(id);
      toast("The check was deleted.");
      location.hash = "#/cases";
    } catch (error) {
      toast(errorMessage(error));
      yes.disabled = false;
    }
  });
  find("#cancelDelete", HTMLButtonElement, area).addEventListener("click", () => {
    setHtml(area, html`<button class="pf-btn" type="button" id="deleteCase">Delete this check</button>`);
    const again = find("#deleteCase", HTMLButtonElement, area);
    again.addEventListener("click", () => confirmDelete(view, id));
    again.focus();
  });
}
