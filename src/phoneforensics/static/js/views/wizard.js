// The four-step "New check" wizard.

import { api, errorMessage } from "../api.js";
import { CONSENT_TEXT, DATA_POLICY, EVIDENCE, GUIDES } from "../content.js";
import { find, findAll, icon, maybe, toast } from "../dom.js";
import { formatDate } from "../format.js";
import { html, setHtml } from "../html.js";
import { openBrowser } from "./browser.js";
import { note, stepList } from "./shared.js";

/** @typedef {import("../content.js").Evidence} Evidence */
/** @typedef {import("../api.js").BackupInfo} BackupInfo */
/** @typedef {import("../api.js").Status} Status */
/** @typedef {"iphone" | "android"} Device */

const STEP_NAMES = ["Phone", "What you saved", "Where it is", "Check"];
const LAST_STEP = STEP_NAMES.length - 1;

/**
 * @typedef {{ step: number, device: Device | null, evidence: Evidence | null, path: string, password: string,
 *   label: string, fast: boolean, backup: BackupInfo | null }} WizardState
 */

/** @returns {WizardState} */
const initialState = () => ({
  step: 0,
  device: null,
  evidence: null,
  path: "",
  password: "",
  label: "",
  fast: false,
  backup: null,
});

/** @type {import("../main.js").RenderView} */
export async function render(view, _arg, ctx) {
  const state = initialState();
  draw(view, state, ctx.status);
  return () => {
    state.password = ""; // never keep a password around after leaving the wizard
  };
}

/** @param {HTMLElement} view @param {WizardState} state @param {Status} status */
function draw(view, state, status) {
  const body = [stepDevice, stepEvidence, stepLocation, stepConfirm][state.step]?.(state, status) ?? html``;
  setHtml(
    view,
    html`<h1 class="pf-page__title">New check</h1>
    <div class="pf-progress"><p class="pf-progress__count">Step ${state.step + 1} of ${STEP_NAMES.length}</p>
      <ol class="pf-progress__bar">${STEP_NAMES.map((name, i) => {
        const stage = i < state.step ? "done" : i === state.step ? "current" : "todo";
        return html`<li class="pf-progress__seg" data-state="${stage}" ${i === state.step ? html`aria-current="step"` : ""}><span>${name}</span></li>`;
      })}</ol></div>
    ${body}`,
  );
  bind(view, state, status);
  maybe("h2, legend", HTMLElement, view)?.setAttribute("tabindex", "-1");
}

/**
 * @param {string} name @param {string} value @param {boolean} checked @param {string} iconName
 * @param {string} title @param {string} text @param {boolean} [recommended]
 */
const choice = (name, value, checked, iconName, title, text, recommended = false) =>
  html`<label class="pf-choice"><input type="radio" name="${name}" value="${value}" ${checked ? html`checked` : ""}>
    <span class="pf-choice__icon">${icon(iconName)}</span>
    <span><span class="pf-choice__title">${title}</span><span class="pf-choice__text">${text}</span>
      ${recommended ? html`<span class="pf-choice__flag"><span class="pf-badge pf-badge--clear">${icon("check")}Recommended</span></span>` : ""}</span>
    <span class="pf-choice__tick">${icon("check")}</span></label>`;

/** @param {WizardState} state @param {{ label: string, enabled: boolean, start?: boolean }} next */
const navigation = (state, next) =>
  html`<div class="pf-wizard-nav">
    ${state.step ? html`<button class="pf-btn pf-btn--quiet" type="button" data-back>${icon("chev-l")}Back</button>` : html`<span></span>`}
    <button class="pf-btn pf-btn--primary pf-btn--lg" type="button" ${next.start ? html`id="startCheck"` : html`data-next`} ${next.enabled ? "" : html`disabled`}>${next.label}${next.start ? "" : icon("chev-r")}</button></div>`;

/** @param {WizardState} state */
function stepDevice(state) {
  return html`<fieldset class="pf-fieldset pf-stack"><legend class="pf-h2">Which kind of phone are you checking?</legend>
    <div class="pf-grid-2">
      ${choice("device", "iphone", state.device === "iphone", "phone", "iPhone", "Any iPhone or iPad running iOS or iPadOS.")}
      ${choice("device", "android", state.device === "android", "android", "Android", "Samsung, Pixel, Xiaomi, OnePlus and other Android phones.")}
    </div></fieldset>
    ${navigation(state, { label: "Continue", enabled: Boolean(state.device) })}`;
}

/** @param {WizardState} state */
function stepEvidence(state) {
  const options = state.device ? EVIDENCE[state.device] : [];
  return html`<fieldset class="pf-fieldset pf-stack"><legend class="pf-h2">What have you saved from the phone?</legend>
    <p class="pf-muted pf-m0">Not sure? Choose the recommended option. We will show you how to make it.</p>
    <div class="pf-grid-2">${options.map((e) => choice("evidence", e.type, state.evidence?.type === e.type, e.icon, e.title, e.description, e.recommended))}</div></fieldset>
    ${navigation(state, { label: "Continue", enabled: Boolean(state.evidence) })}`;
}

/** @param {WizardState} state */
function stepLocation(state) {
  const evidence = state.evidence;
  if (!evidence) return html``;
  const guides = evidence.guides.map(
    (id) => html`<a class="pf-link" href="#/help/${id}" target="_blank">${GUIDES[id]?.title ?? id}</a>`,
  );
  return html`<h2 class="pf-h2">${evidence.heading}</h2>
    ${stepList(evidence.steps)}
    ${guides.length ? note(html`Need more detail? Read the full guide: ${guides.flatMap((g, i) => (i ? [" or ", g] : [g]))}. It opens in a new tab.`, "book") : ""}
    <div class="pf-card pf-stack">
      <div class="pf-field"><label class="pf-field__label" for="pathInputWizard">${evidence.where}</label>
        <p class="pf-field__help" id="locationHelp">${evidence.type === "ios-backup" ? "Looking for iPhone backups on this computer…" : "Choose it with the button, or paste the location."}</p>
        <div class="pf-backups" id="foundBackups"></div>
        <div class="pf-input-row"><input class="pf-input pf-input--mono" id="pathInputWizard" value="${state.path}" spellcheck="false" autocomplete="off" aria-describedby="locationHelp">
          <button class="pf-btn" type="button" id="chooseLocation">${icon(evidence.pick === "file" ? "file" : "folder")}${evidence.pick === "file" ? "Choose file" : "Choose folder"}</button></div>
        <div id="backupInfo" aria-live="polite"></div></div>
      ${
        evidence.password
          ? html`<div class="pf-field"><label class="pf-field__label" for="passwordInput">${evidence.password[0]}</label><p class="pf-field__help" id="passwordHelp">${evidence.password[1]}</p>
        <input class="pf-input" type="password" id="passwordInput" value="${state.password}" autocomplete="off" aria-describedby="passwordHelp"></div>`
          : ""
      }
    </div>
    ${navigation(state, { label: "Continue", enabled: Boolean(state.path) })}`;
}

/** @param {WizardState} state @param {Status} status */
function stepConfirm(state, status) {
  const evidence = state.evidence;
  if (!evidence) return html``;
  const lists = status.iocs.count;
  return html`<h2 class="pf-h2">Ready to check</h2>
    <div class="pf-card pf-stack">
      <div class="pf-field"><label class="pf-field__label" for="labelInput">Give this check a name</label>
        <p class="pf-field__help" id="labelHelp">So you can find it again later. For example, "Maria's iPhone".</p>
        <input class="pf-input" id="labelInput" value="${state.label}" maxlength="80" autocomplete="off" aria-describedby="labelHelp"></div>
      <dl class="pf-summary">
        <dt>Phone</dt><dd>${state.device === "iphone" ? "iPhone" : "Android"}</dd>
        <dt>What you saved</dt><dd>${evidence.title}</dd>
        <dt>Location</dt><dd class="pf-mono">${state.path}</dd>
        ${evidence.password ? html`<dt>Password</dt><dd>${state.password ? "Entered" : "None"}</dd>` : ""}
        <dt>Spyware lists</dt><dd>${lists ? html`<span class="pf-badge pf-badge--clear">${icon("check")}${lists} lists ready</span>` : html`<span class="pf-badge pf-badge--attention">None downloaded</span>`}</dd>
      </dl>
      ${state.device === "iphone" ? html`<label class="pf-row pf-checkbox"><input type="checkbox" id="fastInput" ${state.fast ? html`checked` : ""}> Quick check (skips the slowest parts)</label>` : ""}
    </div>
    ${lists ? "" : note(html`Without spyware lists, the check can read the phone data but cannot recognise known spyware. <a class="pf-link" href="#/">Download them on the Home screen</a>.`)}
    <section class="pf-stack-sm" aria-labelledby="policyTitle">
      <h3 class="pf-section-title pf-m0" id="policyTitle">Before you start: tell the phone's user</h3>
      <dl class="pf-policy">${DATA_POLICY.map(([title, text]) => html`<div class="pf-policy__item"><dt>${title}</dt><dd>${text}</dd></div>`)}</dl>
    </section>
    <label class="pf-consent"><input type="checkbox" id="consentInput">
      <span><span class="pf-consent__title">The person whose data is on this phone has agreed to this check</span>
      <span class="pf-consent__text">${CONSENT_TEXT}</span></span></label>
    ${note("Everything runs on this computer. Nothing from the phone is uploaded.", "lock")}
    ${navigation(state, { label: "Start check", enabled: false, start: true })}`;
}

/** @param {HTMLElement} view @param {WizardState} state @param {Status} status */
function bind(view, state, status) {
  const next = maybe("[data-next]", HTMLButtonElement, view);
  const save = () => {
    state.path = maybe("#pathInputWizard", HTMLInputElement, view)?.value.trim() ?? state.path;
    state.password = maybe("#passwordInput", HTMLInputElement, view)?.value ?? state.password;
    state.label = maybe("#labelInput", HTMLInputElement, view)?.value ?? state.label;
    state.fast = maybe("#fastInput", HTMLInputElement, view)?.checked ?? state.fast;
  };
  /** @param {number} delta */
  const go = (delta) => {
    save();
    state.step = Math.min(LAST_STEP, Math.max(0, state.step + delta));
    draw(view, state, status);
    maybe("h2, legend", HTMLElement, view)?.focus();
  };
  next?.addEventListener("click", () => go(1));
  maybe("[data-back]", HTMLButtonElement, view)?.addEventListener("click", () => go(-1));

  for (const input of findAll("input[name=device]", HTMLInputElement, view)) {
    input.addEventListener("change", () => {
      const device = /** @type {Device} */ (input.value);
      if (state.device !== device) state.evidence = null;
      state.device = device;
      if (next) next.disabled = false;
    });
  }
  for (const input of findAll("input[name=evidence]", HTMLInputElement, view)) {
    input.addEventListener("change", () => {
      if (state.evidence?.type !== input.value) {
        state.path = "";
        state.backup = null;
      }
      state.evidence = (state.device && EVIDENCE[state.device].find((e) => e.type === input.value)) || null;
      if (next) next.disabled = !state.evidence;
    });
  }

  const pathInput = maybe("#pathInputWizard", HTMLInputElement, view);
  if (pathInput && state.evidence) {
    const evidence = state.evidence;
    /** @param {string} path @param {BackupInfo | null} backup */
    const setPath = (path, backup) => {
      pathInput.value = path;
      state.path = path.trim();
      showBackupInfo(view, state, backup);
      if (next) next.disabled = !state.path;
    };
    pathInput.addEventListener("input", () => setPath(pathInput.value, null));
    find("#chooseLocation", HTMLButtonElement, view).addEventListener("click", () =>
      openBrowser({
        mode: evidence.pick,
        title:
          evidence.pick === "file"
            ? "Choose the file"
            : evidence.type === "ios-backup"
              ? "Choose the backup folder"
              : "Choose a folder",
        start: state.path || status.home,
        onPick: setPath,
      }),
    );
    showBackupInfo(view, state, state.backup);
    if (evidence.type === "ios-backup") void listBackups(view, state, setPath);
  }

  const consent = maybe("#consentInput", HTMLInputElement, view);
  const start = maybe("#startCheck", HTMLButtonElement, view);
  if (consent && start) {
    consent.addEventListener("change", () => {
      start.disabled = !consent.checked;
    });
    start.addEventListener("click", async () => {
      save();
      if (!state.evidence) return;
      start.disabled = true;
      try {
        const job = await api.startScan({
          type: state.evidence.type,
          path: state.path,
          password: state.password,
          label: state.label,
          fast: state.fast,
          consent: consent.checked,
        });
        state.password = "";
        location.hash = `#/job/${job.id}`;
      } catch (error) {
        toast(errorMessage(error));
        start.disabled = false;
      }
    });
  }
}

/** @param {HTMLElement} view @param {WizardState} state @param {BackupInfo | null} backup */
function showBackupInfo(view, state, backup) {
  state.backup = backup;
  const out = maybe("#backupInfo", HTMLElement, view);
  if (!out) return;
  setHtml(
    out,
    !backup
      ? html``
      : backup.encrypted
        ? html`<span class="pf-badge pf-badge--clear">${icon("lock")}Encrypted backup. Enter its password below.</span>`
        : html`<span class="pf-badge pf-badge--attention">Not encrypted. Fewer things can be checked.</span>`,
  );
}

/**
 * @param {HTMLElement} view @param {WizardState} state
 * @param {(path: string, backup: BackupInfo | null) => void} setPath
 */
async function listBackups(view, state, setPath) {
  const backups = await api.iosBackups().catch(() => []);
  const out = maybe("#foundBackups", HTMLElement, view);
  const help = maybe("#locationHelp", HTMLElement, view);
  if (!out || !help) return;
  if (!backups.length) {
    help.textContent = "We could not find one in the usual places. Choose the folder.";
    return;
  }
  help.textContent =
    backups.length === 1
      ? "We found this backup on this computer. Select it, or choose another folder."
      : "We found these backups on this computer. Select one, or choose another folder.";
  setHtml(
    out,
    html`${backups.map(
      (b, i) => html`<button type="button" class="pf-check" data-index="${i}" aria-pressed="${state.path === b.path}">
        <span class="pf-check__mark pf-check__mark--neutral">${icon("phone")}</span>
        <span><span class="pf-check__name">${b.name}</span><span class="pf-check__meta">${[b.model, b.ios && `iOS ${b.ios}`, b.date && formatDate(b.date)].filter(Boolean).join(" · ")}</span></span>
        ${b.encrypted ? html`<span class="pf-badge pf-badge--clear">${icon("lock")}Encrypted</span>` : html`<span class="pf-badge pf-badge--attention">Not encrypted</span>`}
        <span class="pf-check__chev">${icon("check")}</span></button>`,
    )}`,
  );
  for (const button of findAll("[data-index]", HTMLButtonElement, out)) {
    button.addEventListener("click", () => {
      const backup = backups[Number(button.dataset.index)];
      if (!backup) return;
      setPath(backup.path, backup);
      for (const other of findAll("[data-index]", HTMLButtonElement, out))
        other.setAttribute("aria-pressed", String(other === button));
    });
  }
}
