import { api } from "../api.js";
import { TYPE_NAMES } from "../content.js";
import { icon } from "../dom.js";
import { formatDate } from "../format.js";
import { html, setHtml } from "../html.js";

/** @typedef {import("../api.js").CaseListItem} CaseListItem */

/** @param {CaseListItem} c */
const badge = (c) =>
  c.verdict === "detected"
    ? html`<span class="pf-badge pf-badge--attention">${icon("shield-alert")}${c.detection_count} to look at</span>`
    : c.verdict === "clean"
      ? html`<span class="pf-badge pf-badge--clear">${icon("check")}Nothing found</span>`
      : html`<span class="pf-badge">Did not finish</span>`;

/** @param {CaseListItem} c */
const mark = (c) =>
  c.verdict === "detected"
    ? html`<span class="pf-check__mark pf-check__mark--attention">${icon("shield-alert")}</span>`
    : c.verdict === "clean"
      ? html`<span class="pf-check__mark pf-check__mark--clear">${icon("shield-check")}</span>`
      : html`<span class="pf-check__mark pf-check__mark--neutral">${icon("info")}</span>`;

/** @type {import("../main.js").RenderView} */
export async function render(view, _arg, ctx) {
  const cases = await api.cases();
  setHtml(
    view,
    html`<div class="pf-head"><div><h1 class="pf-page__title">Past checks</h1><p class="pf-muted">Saved on this computer only.</p></div>
      <a class="pf-btn pf-btn--primary pf-btn--lg" href="#/scan">${icon("plus")}New check</a></div>
    ${
      cases.length
        ? html`<ul class="pf-stack-sm pf-plain-list">${cases.map(
            (c) => html`<li><a class="pf-check" href="#/case/${encodeURIComponent(c.id)}">${mark(c)}
              <span><span class="pf-check__name">${c.label}</span><span class="pf-check__meta">${TYPE_NAMES[c.type] ?? c.type} · ${formatDate(c.created)}${c.demo ? html` · <span class="pf-demo-tag">Example data</span>` : ""}</span></span>
              ${badge(c)}<span class="pf-check__chev">${icon("chev-r")}</span></a></li>`,
          )}</ul>`
        : html`<div class="pf-empty">${icon("clock")}<p>No checks yet.</p><a class="pf-btn pf-btn--primary" href="#/scan">Start your first check</a></div>`
    }
    <details class="pf-details"><summary>Where are results saved?</summary><p class="pf-muted">In <span class="pf-mono">${ctx.status.cases_dir}</span>. Delete a folder there to remove a check.</p></details>`,
  );
}
