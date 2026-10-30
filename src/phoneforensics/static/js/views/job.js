// Live progress for a running check, list download or app update.

import { api, errorMessage } from "../api.js";
import { find, icon, maybe, toast } from "../dom.js";
import { areaOf, moduleFromLogLine, stageText } from "../format.js";
import { html, setHtml } from "../html.js";
import { restartApp } from "./home.js";
import { emptyState, ring } from "./shared.js";

/** @typedef {import("../api.js").Job} Job */
/** @typedef {import("../format.js").StageState} StageState */

const MAX_LOG_LINES = 2000;
const ELAPSED_REFRESH_MS = 5000;

/** @type {Record<import("../api.js").JobKind, { title: (job: Job) => string, intro: string, stages: [string, string][] }>} */
const KINDS = {
  scan: {
    title: (job) => job.title,
    intro: "This usually takes 5 to 10 minutes. ",
    stages: [
      ["lists", "Load the latest spyware lists"],
      ["open", "Open the phone data"],
    ],
  },
  update: {
    title: () => "Updating PhoneForensics",
    intro: "This usually takes a minute or two. ",
    stages: [
      ["app", "Download the latest PhoneForensics"],
      ["mvt", "Update MVT"],
    ],
  },
  iocs: { title: () => "Updating spyware lists", intro: "", stages: [["dl", "Download the latest spyware lists"]] },
};

/** @type {import("../main.js").RenderView} */
export async function render(view, jobId) {
  const job = await api.job(jobId).catch(() => null);
  if (!job) {
    setHtml(
      view,
      html`${emptyState("This check is no longer running.")}<p class="pf-center"><a class="pf-btn" href="#/cases">See past checks</a></p>`,
    );
    return;
  }
  const kind = KINDS[job.kind];
  /** @type {[string, string][]} */
  const stages = kind.stages.map(([key, label]) => [key, label]);
  let current = 0;

  setHtml(
    view,
    html`<h1 class="pf-page__title">${kind.title(job)}</h1>
    <section class="pf-card pf-pad"><div class="pf-scan">
      ${ring()}
      <h2 class="pf-scan__title" id="phase" aria-live="polite">Starting…</h2>
      <p class="pf-scan__text" id="jobIntro">${kind.intro}You can leave this window open and come back. Time so far: <span id="elapsed">0 min</span>.</p>
      <ul class="pf-stages" id="stages"></ul>
      <div id="jobActions" class="pf-row pf-row--center"></div>
      <details class="pf-details"><summary>Show technical details</summary><div class="pf-log" id="log" tabindex="0" aria-label="Technical log"></div></details>
      ${job.kind === "update" ? "" : html`<button class="pf-btn" type="button" id="stopJob">Stop check</button>`}
    </div></section>`,
  );
  const log = find("#log", HTMLElement, view);
  const phase = find("#phase", HTMLElement, view);

  const drawStages = () => {
    setHtml(
      find("#stages", HTMLElement, view),
      html`${stages.map(([, label], i) => {
        /** @type {StageState} */
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return html`<li data-state="${state}">${icon(state === "done" ? "check" : state === "current" ? "clock" : "dot")}${stageText(label, state)}</li>`;
      })}`,
    );
    const active = stages[current];
    phase.textContent = active ? stageText(active[1], "current") : "Finishing…";
  };
  /** @param {string} key @param {string} [label] */
  const advanceTo = (key, label) => {
    let index = stages.findIndex(([k]) => k === key);
    if (index === -1 && label) index = stages.push([key, label]) - 1;
    if (index > current) {
      current = index;
      drawStages();
    }
  };
  drawStages();

  const timer = setInterval(() => {
    const out = maybe("#elapsed", HTMLElement, view);
    if (out) out.textContent = `${Math.floor((Date.now() / 1000 - job.started) / 60)} min`;
  }, ELAPSED_REFRESH_MS);
  maybe("#stopJob", HTMLButtonElement, view)?.addEventListener("click", () => {
    void api.cancelJob(jobId).then(() => toast("Stopping the check…"));
  });

  const events = new EventSource(api.jobStreamUrl(jobId));
  events.addEventListener("message", (message) => {
    const { line } = /** @type {{ line: string }} */ (JSON.parse(String(message.data)));
    const row = document.createElement("div");
    row.className = /CRITICAL|ALERT/.test(line) ? "c" : /WARNING/.test(line) ? "w" : "";
    row.textContent = line;
    log.append(row);
    if (log.childElementCount > MAX_LOG_LINES) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
    if (job.kind === "update") {
      if (line.startsWith("Updating MVT")) advanceTo("mvt");
      return;
    }
    if (job.kind !== "scan") return;
    if (/decrypt/i.test(line)) advanceTo("open");
    const module = moduleFromLogLine(line);
    if (module) {
      advanceTo("open");
      const area = areaOf(module);
      advanceTo(`area:${area}`, `Check ${area}`);
    }
  });
  events.addEventListener("error", () => {
    if (events.readyState === EventSource.CLOSED) toast("Lost contact with PhoneForensics. Is its window still open?");
  });
  events.addEventListener("done", (message) => {
    events.close();
    clearInterval(timer);
    const done = /** @type {Job} */ (JSON.parse(String(message.data)));
    if (done.kind === "scan" && done.case_dir) {
      location.hash = `#/case/${encodeURIComponent(done.case_dir.split(/[\\/]/).pop() ?? "")}`;
    } else if (done.kind === "iocs" && done.status === "done") {
      toast("Spyware lists updated.");
      location.hash = "#/";
    } else if (done.kind === "iocs") {
      showDownloadFailure(view, done);
    } else {
      finishUpdate(view, done, () => {
        current = stages.length;
        drawStages();
      });
    }
  });

  return () => {
    events.close();
    clearInterval(timer);
  };
}

/** @param {HTMLElement} view @param {Job} done @param {() => void} markAllDone */
function finishUpdate(view, done, markAllDone) {
  maybe(".pf-scan__ring", SVGElement, view)?.remove();
  const phase = find("#phase", HTMLElement, view);
  const intro = find("#jobIntro", HTMLElement, view);
  if (done.status !== "done") {
    phase.textContent = "The update did not finish";
    intro.textContent = done.error ?? "Something went wrong. Your current version still works.";
    return;
  }
  markAllDone();
  phase.textContent = "Update installed";
  intro.textContent = "Restart PhoneForensics to start using the new version.";
  const actions = find("#jobActions", HTMLElement, view);
  setHtml(
    actions,
    html`<button class="pf-btn pf-btn--primary pf-btn--lg" type="button" id="restartNow">Restart now</button>`,
  );
  find("#restartNow", HTMLButtonElement, actions).addEventListener("click", () => void restartApp(view));
}

/**
 * Stay on this screen and explain why the download failed, instead of hiding it behind a toast.
 * @param {HTMLElement} view @param {Job} done
 */
function showDownloadFailure(view, done) {
  maybe(".pf-scan__ring", SVGElement, view)?.remove();
  maybe("#stopJob", HTMLButtonElement, view)?.remove();
  find("#phase", HTMLElement, view).textContent = "The spyware lists could not be downloaded";
  find("#jobIntro", HTMLElement, view).textContent = done.error ?? "Something went wrong.";
  setHtml(find("#stages", HTMLElement, view), html``);
  const details = maybe(".pf-details", HTMLDetailsElement, view);
  if (details) details.open = true;
  const actions = find("#jobActions", HTMLElement, view);
  setHtml(
    actions,
    html`<button class="pf-btn pf-btn--primary" type="button" id="retryDownload">${icon("refresh")}Try again</button>
    <a class="pf-btn pf-btn--quiet" href="#/">Back to Home</a>`,
  );
  find("#retryDownload", HTMLButtonElement, actions).addEventListener("click", async () => {
    try {
      location.hash = `#/job/${(await api.updateIndicators()).id}`;
    } catch (error) {
      toast(errorMessage(error));
    }
  });
}
