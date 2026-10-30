import { GUIDES, HELPLINES, LINKS, link } from "../content.js";
import { find, icon } from "../dom.js";
import { html, raw, setHtml } from "../html.js";
import { footer, stepList } from "./shared.js";

/** @type {import("../main.js").RenderView} */
export async function render(view, which) {
  const guide = GUIDES[which];
  if (guide) {
    setHtml(
      view,
      html`<div><a class="pf-page__back" href="#/help">← Guide</a><h1 class="pf-page__title">${guide.title}</h1></div>
      <p class="pf-body-lg">${guide.intro}</p>
      ${stepList(guide.steps)}
      <section class="pf-stack-sm" aria-labelledby="troubleTitle"><h2 class="pf-section-title pf-m0" id="troubleTitle">If something goes wrong</h2>
        ${guide.trouble.map(([question, answer]) => html`<details class="pf-card"><summary class="pf-summary-toggle">${question}</summary><p class="pf-muted pf-mt-3">${answer}</p></details>`)}</section>
      <div class="pf-row"><a class="pf-btn pf-btn--primary pf-btn--lg" href="#/scan">Start a new check ${icon("chev-r")}</a><button class="pf-btn" type="button" id="printSteps">${icon("print")}Print these steps</button></div>
      ${footer()}`,
    );
    find("#printSteps", HTMLButtonElement, view).addEventListener("click", () => window.print());
    return;
  }
  setHtml(
    view,
    html`<h1 class="pf-page__title">Guide</h1>
    ${stepList([
      [
        "Save the phone's data",
        raw(
          "Make an iPhone backup, or collect Android data with AndroidQF. Pick your phone below for step-by-step instructions.",
        ),
      ],
      [
        "We check it on this computer",
        raw(
          "MVT reads messages, browsing history, apps and system logs, and compares them with lists of known spyware.",
        ),
      ],
      ["Read the result", raw("You get a clear answer and plain next steps, plus files you can give to an expert.")],
    ])}
    <section aria-labelledby="howTitle"><h2 class="pf-section-title" id="howTitle">How to save data from the phone</h2>
      <ul class="pf-stack-sm pf-plain-list">${Object.entries(GUIDES).map(
        ([
          id,
          g,
        ]) => html`<li><a class="pf-check" href="#/help/${id}"><span class="pf-check__mark pf-check__mark--neutral">${icon(g.icon)}</span>
          <span><span class="pf-check__name">${g.title}</span><span class="pf-check__meta">${g.steps.length} steps · ${g.note}</span></span>
          <span></span><span class="pf-check__chev">${icon("chev-r")}</span></a></li>`,
      )}</ul></section>
    <section class="pf-card pf-stack" aria-labelledby="knowTitle"><h2 class="pf-h2" id="knowTitle">Good to know</h2>
      <ul class="pf-bullets">
        <li><b>Private.</b> Everything happens on this computer. Phone data is never uploaded.</li>
        <li><b>Keep the lists up to date</b> from the Home screen. New spyware is found regularly.</li>
        <li><b>Keep the app up to date</b> with <b>Check for updates</b> on the Home screen.</li>
        <li><b>Nothing found is not a guarantee.</b> If you are at high risk, for example as a journalist, activist or lawyer, also talk to an expert.</li>
        <li><b>Consent.</b> Only check a phone when the person whose data is on it has been told what the check involves and has freely agreed. This is a condition of the ${raw(link(LINKS.mvtLicense, "MVT License"))}.</li>
        <li><b>Deleting results.</b> Results stay on this computer until you delete them from <b>Past checks</b>.</li>
      </ul></section>
    <section class="pf-card pf-stack" aria-labelledby="helpTitle"><h2 class="pf-h2" id="helpTitle">Get help</h2>
      <ul class="pf-bullets">
        <li>${HELPLINES}: free help for people at risk.</li>
        <li>${raw(link(LINKS.mvtDocs, "MVT documentation"))}: for technical users.</li>
      </ul></section>
    ${footer()}`,
  );
}
