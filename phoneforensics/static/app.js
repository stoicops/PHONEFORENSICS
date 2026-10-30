const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name, cls = "") => `<svg class="pf-icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
};
const toast = (msg) => {
  const d = document.createElement("div");
  d.textContent = msg;
  $("#toast").append(d);
  setTimeout(() => d.remove(), 4000);
};
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
let status = null;

const TYPE_NAMES = {
  "ios-backup": "iPhone backup", "ios-fs": "iPhone file copy", "android-qf": "AndroidQF collection",
  "android-bugreport": "Android report", "android-backup": "Android backup",
};

// ------------------------------------------------------------ evidence types
const EVIDENCE = {
  iphone: [
    {
      type: "ios-backup", icon: "save", title: "iPhone backup", recommended: true,
      desc: "Made with Finder on a Mac, or Apple Devices or iTunes on Windows.",
      heading: "Make an iPhone backup",
      how: [
        ["Connect the iPhone with a cable", "When the phone asks, tap <b>Trust</b>."],
        ["Open Finder or Apple Devices", "On a Mac, open <b>Finder</b> and click the iPhone in the sidebar. On Windows, open <b>Apple Devices</b> or <b>iTunes</b>."],
        ["Tick \"Encrypt local backup\"", "Choose a password you will remember. Encrypted backups let us check much more."],
        ["Click \"Back Up Now\" and wait", "Come back here when it has finished."],
      ],
      pick: "folder", where: "Where is the backup?",
      password: ["Backup password", "Only if you ticked \"Encrypt local backup\". It is used on this computer only."],
    },
    {
      type: "ios-fs", icon: "box", title: "Full copy of the phone's files", desc: "For experts only. Usually made with specialist tools.",
      heading: "Choose the file copy",
      how: [["Find the extracted folder", "Choose the folder that contains the copy of the phone's file system."]],
      pick: "folder", where: "Where is the folder?",
    },
  ],
  android: [
    {
      type: "android-qf", icon: "box", title: "AndroidQF collection", recommended: true,
      desc: "Collected with AndroidQF, a free tool from Amnesty International.",
      heading: "Collect data with AndroidQF",
      how: [
        ["Turn on USB debugging", "Settings › About phone › tap <b>Build number</b> 7 times. Then Settings › Developer options › turn on <b>USB debugging</b>."],
        ["Download AndroidQF", "Get it from <a class=\"pf-link\" href=\"https://github.com/mvt-project/androidqf/releases\" target=\"_blank\" rel=\"noopener\">the AndroidQF releases page</a> for this computer."],
        ["Connect the phone and run it", "Accept the prompt on the phone and answer the questions AndroidQF asks."],
        ["Wait for it to finish", "It creates a folder (or a .zip file). Come back here and choose it."],
      ],
      pick: "any", where: "Where is the AndroidQF folder or .zip?",
    },
    {
      type: "android-bugreport", icon: "bug", title: "Bug report", desc: "A .zip made from Developer options on the phone.",
      heading: "Make a bug report",
      how: [
        ["Open Developer options", "Settings › System › Developer options (turn them on first by tapping <b>Build number</b> 7 times)."],
        ["Take a full bug report", "Tap <b>Take bug report</b> › <b>Full report</b> and wait for the notification."],
        ["Copy it to this computer", "Share or copy the .zip file here, then choose it below."],
      ],
      pick: "file", where: "Where is the bug report .zip?",
    },
    {
      type: "android-backup", icon: "save", title: "Android backup (.ab)", desc: "For experts. A backup file made with adb.",
      heading: "Choose the backup file",
      how: [["Find the .ab file", "Choose the backup file created with <code>adb backup</code>."]],
      pick: "file", where: "Where is the .ab file?", password: ["Backup password", "Only if the backup has one."],
    },
  ],
};

// ------------------------------------------------------------ routing
const routes = { "": home, scan: scanWizard, cases: casesView, case: caseView, job: jobView, help: helpView };
async function route() {
  closeBrowser();
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const nav = name === "case" ? "cases" : name === "job" ? "scan" : name || "home";
  document.querySelectorAll("[data-nav]").forEach((a) => (a.dataset.nav === nav ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  view.innerHTML = "";
  await (routes[name] || home)(decodeURIComponent(arg || ""));
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

async function loadStatus() {
  status = await api("/api/status");
  if (status.support_url) { $("#supportLink").href = status.support_url; $("#supportLink").hidden = false; }
}

// ------------------------------------------------------------ home
async function home() {
  const cases = await api("/api/cases");
  const flagged = cases.filter((c) => c.verdict === "detected").length;
  const iocs = status.iocs;
  view.innerHTML = `
    <section class="pf-welcome">
      <h1 class="pf-welcome__title">Is someone spying on your phone?</h1>
      <p class="pf-welcome__text">PhoneForensics checks iPhones and Android phones for traces of known spyware, such as Pegasus and Predator. It uses the Mobile Verification Toolkit from Amnesty International. Everything stays on this computer.</p>
      <div class="pf-row"><a class="pf-btn pf-btn--primary pf-btn--lg" href="#/scan">Start a new check ${icon("chev-r")}</a><a class="pf-btn pf-btn--quiet" href="#/help">How does it work?</a></div>
    </section>
    ${status.mvt ? "" : `<div class="pf-note">${icon("info")}<p style="margin:0">MVT is not installed. Run <code>pip install mvt</code> and start PhoneForensics again.</p></div>`}
    ${!iocs.count ? `<div class="pf-note">${icon("info")}<p style="margin:0"><b>First time?</b> Download the spyware lists before your first check. Without them we cannot recognise known spyware.</p></div>` : ""}
    <div class="pf-grid-3">
      <div class="pf-stat"><p class="pf-stat__value">${iocs.count}</p><p class="pf-stat__label">Spyware lists${iocs.updated ? `, updated ${esc(fmtDate(iocs.updated))}` : ""}</p>
        <button class="pf-btn" style="margin-top:var(--space-4)" id="updIoc">${icon(iocs.count ? "refresh" : "download")}${iocs.count ? "Update lists" : "Download lists"}</button></div>
      <div class="pf-stat"><p class="pf-stat__value">${cases.length}</p><p class="pf-stat__label">Checks on this computer</p>
        <a class="pf-btn pf-btn--quiet" style="margin-top:var(--space-4)" href="#/cases">See past checks</a></div>
      <div class="pf-stat ${flagged ? "pf-stat--attention" : "pf-stat--clear"}"><p class="pf-stat__value">${flagged}</p><p class="pf-stat__label">Checks with something to look at</p></div>
    </div>
    <section class="pf-card pf-stack" id="updates">
      <div class="pf-head"><div><h2 class="pf-h2">Updates</h2><p class="pf-muted">PhoneForensics ${esc(status.version)} · MVT ${esc(status.mvt || "not installed")}</p></div>
        <button class="pf-btn" id="checkUpd">${icon("refresh")}Check for updates</button></div>
      <div id="updResult"></div>
    </section>
    ${footer()}`;
  $("#updIoc").onclick = updateIocs;
  $("#checkUpd").onclick = () => checkUpdates(true);
  if (updateInfo) renderUpdates(updateInfo); else checkUpdates(false);
}

// ------------------------------------------------------------ app updates
let updateInfo = null;
async function checkUpdates(manual) {
  const out = $("#updResult");
  if (manual && out) out.innerHTML = `<p class="pf-muted" style="margin:0">Checking…</p>`;
  try { updateInfo = await api("/api/updates"); } catch (e) { if (manual && out) out.innerHTML = `<p class="pf-muted" style="margin:0">${esc(e.message)}</p>`; return; }
  if (manual || updateInfo.app.available || updateInfo.mvt.available) renderUpdates(updateInfo, manual);
}
function renderUpdates(u, manual) {
  const out = $("#updResult");
  if (!out) return;
  const any = u.app.available || u.mvt.available;
  if (!any) {
    out.innerHTML = manual ? `<span class="pf-badge pf-badge--clear">${icon("check")}Everything is up to date</span>${u.errors.length ? `<p class="pf-field__help">${u.errors.map(esc).join(" ")}</p>` : ""}` : "";
    return;
  }
  const lines = [];
  if (u.app.available) lines.push(u.method === "git" ? `A new version of PhoneForensics is ready (${esc(u.app.latest)}).` : `PhoneForensics ${esc(u.app.latest)} is available.`);
  if (u.mvt.available) lines.push(`MVT ${esc(u.mvt.latest)} is available${u.mvt.current ? ` (you have ${esc(u.mvt.current)})` : ""}.`);
  const canInstall = u.method === "git" || !u.app.available;
  out.innerHTML = `<div class="pf-note">${icon("download")}<div class="pf-stack-sm"><p style="margin:0">${lines.join(" ")}</p>
    <div class="pf-row">
      ${canInstall ? `<button class="pf-btn pf-btn--primary" id="applyUpd">${icon("download")}Update now</button>` : ""}
      ${u.app.available && u.method !== "git" ? `<a class="pf-btn pf-btn--primary" href="${esc(u.app.url)}" target="_blank" rel="noopener">${icon("download")}Download the new version</a>` : ""}
      ${u.app.available && u.method !== "git" && u.mvt.available ? `<button class="pf-btn" id="applyUpd">Update MVT only</button>` : ""}
    </div></div></div>`;
  const btn = $("#applyUpd");
  if (btn) btn.onclick = async () => {
    try { const job = await api("/api/updates/apply", { method: "POST" }); location.hash = `#/job/${job.id}`; } catch (e) { toast(e.message); }
  };
}
async function restartApp() {
  await api("/api/restart", { method: "POST" });
  view.innerHTML = `<section class="pf-card pf-pad"><div class="pf-scan">
    <svg class="pf-scan__ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="pf-scan__track" cx="50" cy="50" r="42"/><circle class="pf-scan__fill" cx="50" cy="50" r="42" stroke-dasharray="70 264"/></svg>
    <h2 class="pf-scan__title">Restarting PhoneForensics…</h2><p class="pf-scan__text">This page will reload by itself in a few seconds.</p></div></section>`;
  await new Promise((r) => setTimeout(r, 2000));
  for (let i = 0; i < 30; i++) {
    try { await api("/api/status"); location.hash = "#/"; location.reload(); return; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  view.innerHTML = `<div class="pf-note">${icon("info")}<p style="margin:0">PhoneForensics did not come back by itself. Close the black window and open PhoneForensics again.</p></div>`;
}

const footer = () => `<footer class="pf-footer">PhoneForensics by Surinder Lall · MIT License · Built on <a href="https://github.com/mvt-project/mvt" target="_blank" rel="noopener">MVT</a> (MVT License 1.1). Not affiliated with or endorsed by Amnesty International.</footer>`;

async function updateIocs() {
  const job = await api("/api/iocs/update", { method: "POST" });
  location.hash = `#/job/${job.id}`;
}

// ------------------------------------------------------------ scan wizard
const wiz = { step: 0, device: null, ev: null, path: "", password: "", label: "", fast: false, backupInfo: null };
const STEP_NAMES = ["Phone", "What you saved", "Where it is", "Check"];

async function scanWizard() {
  Object.assign(wiz, { step: 0, device: null, ev: null, path: "", password: "", label: "", fast: false, backupInfo: null });
  renderWizard();
}

function renderWizard() {
  const segs = STEP_NAMES.map((n, i) => `<li class="pf-progress__seg" data-state="${i < wiz.step ? "done" : i === wiz.step ? "current" : "todo"}"${i === wiz.step ? ' aria-current="step"' : ""}><span>${n}</span></li>`).join("");
  const body = [stepDevice, stepEvidence, stepLocate, stepConfirm][wiz.step]();
  view.innerHTML = `<h1 class="pf-page__title">New check</h1>
    <div class="pf-progress"><p class="pf-progress__count">Step ${wiz.step + 1} of 4</p><ol class="pf-progress__bar">${segs}</ol></div>
    ${body}`;
  bindWizard();
}

const choice = (name, value, checked, ic, title, text, recommended) => `
  <label class="pf-choice"><input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""}>
    <span class="pf-choice__icon">${icon(ic)}</span>
    <span><p class="pf-choice__title">${title}</p><p class="pf-choice__text">${text}</p>
      ${recommended ? `<p class="pf-choice__flag"><span class="pf-badge pf-badge--clear">${icon("check")}Recommended</span></p>` : ""}</span>
    <span class="pf-choice__tick">${icon("check")}</span></label>`;

const wizNav = (nextLabel = "Continue", enabled = true, id = "") => `
  <div class="pf-wizard-nav">
    ${wiz.step ? `<button class="pf-btn pf-btn--quiet" data-back>${icon("chev-l")}Back</button>` : "<span></span>"}
    <button class="pf-btn pf-btn--primary pf-btn--lg" ${id ? `id="${id}"` : "data-next"} ${enabled ? "" : "disabled"}>${nextLabel} ${id ? "" : icon("chev-r")}</button></div>`;

function stepDevice() {
  return `<fieldset style="border:0;padding:0;margin:0" class="pf-stack"><legend class="pf-h2" style="margin-bottom:var(--space-4)">Which kind of phone are you checking?</legend>
    <div class="pf-grid-2">
      ${choice("device", "iphone", wiz.device === "iphone", "phone", "iPhone", "Any iPhone or iPad running iOS or iPadOS.")}
      ${choice("device", "android", wiz.device === "android", "android", "Android", "Samsung, Pixel, Xiaomi, OnePlus and other Android phones.")}
    </div></fieldset>
    ${wizNav("Continue", !!wiz.device)}`;
}

function stepEvidence() {
  return `<fieldset style="border:0;padding:0;margin:0" class="pf-stack"><legend class="pf-h2">What have you saved from the phone?</legend>
    <p class="pf-muted" style="margin:0">Not sure? Choose the recommended option. We will show you how to make it.</p>
    <div class="pf-grid-2">${EVIDENCE[wiz.device].map((e) => choice("ev", e.type, wiz.ev?.type === e.type, e.icon, e.title, e.desc, e.recommended)).join("")}</div></fieldset>
    ${wizNav("Continue", !!wiz.ev)}`;
}

function stepLocate() {
  const e = wiz.ev;
  return `<h2 class="pf-h2">${e.heading}</h2>
    <ol class="pf-steps">${e.how.map(([t, d]) => `<li class="pf-steps__item"><div><p class="pf-steps__title">${t}</p><p class="pf-steps__text">${d}</p></div></li>`).join("")}</ol>
    ${(GUIDE_FOR[e.type] || []).length ? `<div class="pf-note">${icon("book")}<p style="margin:0">Need more detail? Read the full guide: ${GUIDE_FOR[e.type].map((g) => `<a class="pf-link" href="#/help/${g}" target="_blank">${esc(GUIDES[g].title)}</a>`).join(" or ")}. It opens in a new tab.</p></div>` : ""}
    <div class="pf-card pf-stack">
      <div class="pf-field"><label class="pf-field__label" for="pathIn">${e.where}</label>
        <p class="pf-field__help" id="foundHelp">${e.type === "ios-backup" ? "Looking for iPhone backups on this computer…" : "Choose it with the button, or paste the location."}</p>
        <div class="pf-backups" id="found"></div>
        <div class="pf-input-row"><input class="pf-input pf-input--mono" id="pathIn" value="${esc(wiz.path)}" spellcheck="false" aria-describedby="foundHelp">
          <button class="pf-btn" id="browseBtn">${icon(e.pick === "file" ? "file" : "folder")}${e.pick === "file" ? "Choose file" : "Choose folder"}</button></div>
        <div id="pathInfo"></div></div>
      ${e.password ? `<div class="pf-field"><label class="pf-field__label" for="pwIn">${e.password[0]}</label><p class="pf-field__help">${e.password[1]}</p>
        <input class="pf-input" type="password" id="pwIn" value="${esc(wiz.password)}" autocomplete="off"></div>` : ""}
    </div>
    ${wizNav("Continue", !!wiz.path)}`;
}

function stepConfirm() {
  const lists = status.iocs.count;
  return `<h2 class="pf-h2">Ready to check</h2>
    <div class="pf-card pf-stack">
      <div class="pf-field"><label class="pf-field__label" for="labelIn">Give this check a name</label>
        <p class="pf-field__help">So you can find it again later. For example, "Maria's iPhone".</p>
        <input class="pf-input" id="labelIn" value="${esc(wiz.label)}"></div>
      <dl class="pf-summary">
        <dt>Phone</dt><dd>${wiz.device === "iphone" ? "iPhone" : "Android"}</dd>
        <dt>What you saved</dt><dd>${wiz.ev.title}</dd>
        <dt>Location</dt><dd class="pf-mono">${esc(wiz.path)}</dd>
        ${wiz.ev.password ? `<dt>Password</dt><dd>${wiz.password ? "Entered" : "None"}</dd>` : ""}
        <dt>Spyware lists</dt><dd>${lists ? `<span class="pf-badge pf-badge--clear">${icon("check")}${lists} lists ready</span>` : `<span class="pf-badge pf-badge--attention">None downloaded</span>`}</dd>
      </dl>
      ${wiz.device === "iphone" ? `<label class="pf-row" style="cursor:pointer"><input type="checkbox" id="fastIn" ${wiz.fast ? "checked" : ""} style="width:20px;height:20px;accent-color:var(--primary)"> Quick check (skips the slowest parts)</label>` : ""}
    </div>
    ${lists ? "" : `<div class="pf-note">${icon("info")}<p style="margin:0">Without spyware lists, the check can read the phone data but cannot recognise known spyware. <a class="pf-link" href="#/">Download them on the Home screen</a>.</p></div>`}
    <label class="pf-consent"><input type="checkbox" id="consentIn">
      <span><p class="pf-consent__title">The owner of this phone agrees to this check</p>
      <p class="pf-consent__text">They know what will be checked and where the results are kept. Checking someone else's phone without their free, informed agreement is not allowed by the <a class="pf-link" href="https://license.mvt.re/1.1/" target="_blank" rel="noopener">MVT License</a> and may be illegal.</p></span></label>
    <div class="pf-note">${icon("lock")}<p style="margin:0">Everything runs on this computer. Nothing from the phone is uploaded.</p></div>
    ${wizNav("Start check", false, "runBtn")}`;
}

function bindWizard() {
  const save = () => {
    if ($("#pathIn")) wiz.path = $("#pathIn").value.trim();
    if ($("#pwIn")) wiz.password = $("#pwIn").value;
    if ($("#labelIn")) wiz.label = $("#labelIn").value;
    if ($("#fastIn")) wiz.fast = $("#fastIn").checked;
  };
  const next = view.querySelector("[data-next]");
  view.querySelectorAll("input[name=device]").forEach((el) => (el.onchange = () => {
    if (wiz.device !== el.value) wiz.ev = null;
    wiz.device = el.value; next.disabled = false;
  }));
  view.querySelectorAll("input[name=ev]").forEach((el) => (el.onchange = () => {
    if (wiz.ev?.type !== el.value) { wiz.path = ""; wiz.backupInfo = null; }
    wiz.ev = EVIDENCE[wiz.device].find((e) => e.type === el.value); next.disabled = false;
  }));
  next?.addEventListener("click", () => { save(); wiz.step++; renderWizard(); });
  view.querySelector("[data-back]")?.addEventListener("click", () => { save(); wiz.step--; renderWizard(); });
  const pathIn = $("#pathIn");
  if (pathIn) {
    pathIn.oninput = () => { wiz.path = pathIn.value.trim(); next.disabled = !wiz.path; };
    $("#browseBtn").onclick = () => openBrowser(wiz.ev, wiz.path, (p, info) => { pathIn.value = p; pathIn.oninput(); showBackupInfo(info); });
    showBackupInfo(wiz.backupInfo);
    if (wiz.ev.type === "ios-backup") findBackups();
  }
  const consent = $("#consentIn");
  if (consent) {
    consent.onchange = () => ($("#runBtn").disabled = !consent.checked);
    $("#runBtn").onclick = startScan;
  }
}

function showBackupInfo(info) {
  wiz.backupInfo = info;
  const el = $("#pathInfo");
  if (!el) return;
  el.innerHTML = !info ? "" : info.encrypted
    ? `<span class="pf-badge pf-badge--clear">${icon("lock")}Encrypted backup. Enter its password below.</span>`
    : `<span class="pf-badge pf-badge--attention">Not encrypted. Fewer things can be checked.</span>`;
}

async function findBackups() {
  const list = await api("/api/ios-backups").catch(() => []);
  const el = $("#found"), help = $("#foundHelp");
  if (!el) return;
  if (!list.length) { help.textContent = "We could not find one in the usual places. Choose the folder."; return; }
  help.textContent = list.length === 1 ? "We found this backup on this computer. Select it, or choose another folder." : "We found these backups on this computer. Select one, or choose another folder.";
  el.innerHTML = list.map((b, i) => `
    <button type="button" class="pf-check" data-i="${i}" aria-pressed="${wiz.path === b.path}">
      <span class="pf-check__mark" style="background:var(--surface-sunken)">${icon("phone")}</span>
      <span><p class="pf-check__name">${esc(b.name)}</p><p class="pf-check__meta">${[b.model, b.ios && "iOS " + b.ios, b.date && fmtDate(b.date)].filter(Boolean).map(esc).join(" · ")}</p></span>
      ${b.encrypted ? `<span class="pf-badge pf-badge--clear">${icon("lock")}Encrypted</span>` : `<span class="pf-badge pf-badge--attention">Not encrypted</span>`}
      <span class="pf-check__chev">${wiz.path === b.path ? icon("check") : ""}</span></button>`).join("");
  el.querySelectorAll("[data-i]").forEach((row) => (row.onclick = () => {
    const b = list[row.dataset.i];
    $("#pathIn").value = b.path; $("#pathIn").oninput(); showBackupInfo(b);
    el.querySelectorAll("[data-i]").forEach((r) => { const on = r === row; r.setAttribute("aria-pressed", on); r.querySelector(".pf-check__chev").innerHTML = on ? icon("check") : ""; r.style.borderColor = on ? "var(--primary)" : ""; });
  }));
}

async function startScan() {
  wiz.label = $("#labelIn").value.trim();
  wiz.fast = $("#fastIn")?.checked || false;
  $("#runBtn").disabled = true;
  try {
    const job = await api("/api/scan", { method: "POST", body: JSON.stringify({ type: wiz.ev.type, path: wiz.path, password: wiz.password, label: wiz.label, fast: wiz.fast, consent: $("#consentIn").checked }) });
    wiz.password = "";
    location.hash = `#/job/${job.id}`;
  } catch (e) { toast(e.message); $("#runBtn").disabled = false; }
}

// ------------------------------------------------------------ file browser
let browserState = null;
async function openBrowser(ev, start, done) {
  browserState = { mode: ev.pick, done, selected: null, data: null };
  $("#browserTitle").textContent = ev.pick === "file" ? "Choose the file" : ev.type === "ios-backup" ? "Choose the backup folder" : "Choose a folder";
  $("#browser").hidden = false;
  await browseTo(start || status.home);
  $("#pathInput").focus();
}
function closeBrowser() { $("#browser").hidden = true; }
async function browseTo(path) {
  try {
    const data = await api("/api/browse?path=" + encodeURIComponent(path));
    browserState.data = data; browserState.selected = null;
    $("#pathInput").value = data.path === "::drives" ? "" : data.path;
    const list = $("#fileList");
    list.innerHTML = data.entries.map((e, i) => `<li role="option" tabindex="0" aria-selected="false" data-i="${i}" class="${e.dir ? "" : "is-file"}">${icon(e.dir ? "folder" : "file")}<span class="${/^\d|-/.test(e.name) ? "pf-mono" : ""}">${esc(e.name)}</span></li>`).join("")
      || `<li class="is-file">This folder is empty.</li>`;
    list.querySelectorAll("[data-i]").forEach((row) => {
      const entry = data.entries[row.dataset.i];
      const select = () => { browserState.selected = entry; list.querySelectorAll("[aria-selected=true]").forEach((r) => r.setAttribute("aria-selected", "false")); row.setAttribute("aria-selected", "true"); updatePick(); };
      row.onclick = select;
      row.ondblclick = () => entry.dir && browseTo(entry.path);
      row.onkeydown = (e) => { if (e.key === "Enter") entry.dir ? browseTo(entry.path) : select(); if (e.key === " ") { e.preventDefault(); select(); } };
    });
    updatePick();
  } catch (e) { toast(e.message); }
}
function updatePick() {
  const { mode, selected, data } = browserState;
  const btn = $("#pickBtn");
  if (selected && !selected.dir) { btn.textContent = "Use this file"; btn.disabled = mode === "folder"; }
  else if (selected) { btn.textContent = "Use this folder"; btn.disabled = mode === "file"; }
  else { btn.textContent = "Use this folder"; btn.disabled = mode === "file" || data.path === "::drives"; }
  $("#browserHint").textContent = data.is_ios_backup ? "This folder is an iPhone backup. Click \"Use this folder\"."
    : mode === "file" ? "Open folders with a double-click, then select the file."
    : "Open a folder with a double-click. Select the one named after the phone.";
}
$("#pickBtn").onclick = async () => {
  const { selected, data, done } = browserState;
  let path = data.path, info = data.ios_backup;
  if (selected) {
    path = selected.path; info = null;
    if (selected.dir) info = (await api("/api/browse?path=" + encodeURIComponent(path)).catch(() => ({}))).ios_backup || null;
  }
  closeBrowser();
  done(path, info);
};
$("#upBtn").onclick = () => browserState.data.parent && browseTo(browserState.data.parent);
$("#pathInput").onkeydown = (e) => e.key === "Enter" && browseTo($("#pathInput").value);
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeBrowser));
document.addEventListener("keydown", (e) => e.key === "Escape" && closeBrowser());

// ------------------------------------------------------------ live job
const AREAS = [
  [/sms|message|imessage/i, "text messages"], [/whatsapp/i, "WhatsApp"], [/safari|chrome|webkit|browser|firefox/i, "browsing history"],
  [/package|app|install/i, "installed apps"], [/process/i, "running processes"], [/calendar/i, "calendar"], [/datausage|netusage|network/i, "network use"],
  [/analytic|crash|shutdown|log|dumpsys|bugreport|getprop|settings/i, "system logs"], [/tcc|permission/i, "app permissions"],
  [/profile|configuration/i, "device profiles"], [/manifest|backup|files/i, "backup files"], [/sysdiag/i, "diagnostics"],
];
const areaOf = (mod) => (AREAS.find(([re]) => re.test(mod)) || [, "phone data"])[1];

async function jobView(id) {
  const job = await api(`/api/jobs/${id}`).catch(() => null);
  if (!job) {
    view.innerHTML = `<div class="pf-empty">${icon("info")}<p>This check is no longer running.</p><a class="pf-btn" href="#/cases">See past checks</a></div>`;
    return;
  }
  const isScan = job.kind === "scan", isUpdate = job.kind === "update";
  const stages = isScan ? [["lists", "Load the latest spyware lists"], ["open", "Open the phone data"]]
    : isUpdate ? [["app", "Download the latest PhoneForensics"], ["mvt", "Update MVT"]] : [["dl", "Download the latest spyware lists"]];
  let current = 0;
  view.innerHTML = `<h1 class="pf-page__title">${esc(isScan ? job.title : isUpdate ? "Updating PhoneForensics" : "Updating spyware lists")}</h1>
    <section class="pf-card pf-pad"><div class="pf-scan">
      <svg class="pf-scan__ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="pf-scan__track" cx="50" cy="50" r="42"/><circle class="pf-scan__fill" cx="50" cy="50" r="42" stroke-dasharray="70 264"/></svg>
      <h2 class="pf-scan__title" id="phase" aria-live="polite">Starting…</h2>
      <p class="pf-scan__text">${isScan ? "This usually takes 5 to 10 minutes. " : isUpdate ? "This usually takes a minute or two. " : ""}You can leave this window open and come back. Time so far: <span id="elapsed">0 min</span>.</p>
      <ul class="pf-stages" id="stages"></ul>
      <details class="pf-details"><summary>Show technical details</summary><div class="pf-log" id="log"></div></details>
      ${isUpdate ? "" : `<button class="pf-btn" id="cancelBtn">Stop check</button>`}
    </div></section>`;
  const drawStages = () => {
    $("#stages").innerHTML = stages.map(([, label], i) => {
      const state = i < current ? "done" : i === current ? "current" : "todo";
      const text = state === "done" ? label.replace(/^Load /, "Loaded ").replace(/^Open /, "Opened ").replace(/^Download /, "Downloaded ").replace(/^Check /, "Checked ") : state === "current" ? label.replace(/^Load /, "Loading ").replace(/^Open /, "Opening ").replace(/^Download /, "Downloading ").replace(/^Check /, "Checking ") : label;
      return `<li data-state="${state}">${icon(state === "done" ? "check" : state === "current" ? "clock" : "dot")}${esc(text)}</li>`;
    }).join("");
    $("#phase").textContent = $("#stages li[data-state=current]")?.textContent || "Finishing…";
  };
  const advanceTo = (key, label) => {
    let idx = stages.findIndex(([k]) => k === key);
    if (idx === -1) { stages.push([key, label]); idx = stages.length - 1; }
    if (idx > current) { current = idx; drawStages(); }
  };
  drawStages();
  const log = $("#log");
  const timer = setInterval(() => { const el = $("#elapsed"); if (el) el.textContent = `${Math.floor((Date.now() / 1000 - job.started) / 60)} min`; }, 5000);
  if ($("#cancelBtn")) $("#cancelBtn").onclick = () => api(`/api/jobs/${id}/cancel`, { method: "POST" }).then(() => toast("Stopping the check…"));
  const es = new EventSource(`/api/jobs/${id}/stream`);
  es.onmessage = (m) => {
    const { line } = JSON.parse(m.data);
    const div = document.createElement("div");
    div.className = /CRITICAL|ALERT/.test(line) ? "c" : /WARNING/.test(line) ? "w" : "";
    div.textContent = line; log.append(div);
    if (log.childElementCount > 2000) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    if (isUpdate) { if (/Updating MVT/.test(line)) advanceTo("mvt"); return; }
    if (!isScan) return;
    const mod = line.match(/mvt\.\w+\.modules\.(?:[\w]+\.)*?(\w+)\]/);
    if (/decrypt/i.test(line)) advanceTo("open", "Open the phone data");
    if (mod) { advanceTo("open"); advanceTo("area:" + areaOf(mod[1]), "Check " + areaOf(mod[1])); }
  };
  es.addEventListener("done", (m) => {
    es.close(); clearInterval(timer);
    const done = JSON.parse(m.data);
    if (done.kind === "update") {
      updateInfo = null;
      if (done.status === "done") {
        current = stages.length; drawStages(); $("#phase").textContent = "Update installed";
        $(".pf-scan__ring").remove();
        $(".pf-scan__text").textContent = "Restart PhoneForensics to start using the new version.";
        const b = document.createElement("button"); b.className = "pf-btn pf-btn--primary pf-btn--lg"; b.textContent = "Restart now"; b.onclick = restartApp;
        $(".pf-details").before(b);
      } else {
        $("#phase").textContent = "The update did not finish"; $(".pf-scan__ring").remove();
        $(".pf-scan__text").textContent = done.error || "Something went wrong. Your current version still works.";
      }
    } else if (done.kind === "iocs") {
      loadStatus();
      toast(done.status === "done" ? "Spyware lists updated." : "Could not update the lists. Check your internet connection.");
      location.hash = "#/";
    } else if (done.case_dir) {
      location.hash = `#/case/${encodeURIComponent(done.case_dir.split(/[\\/]/).pop())}`;
    }
  });
  window.addEventListener("hashchange", () => { es.close(); clearInterval(timer); }, { once: true });
}

// ------------------------------------------------------------ results
const pretty = (s) => s.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());

const NEXT_STEPS = {
  attention: [
    ["Keep using the phone normally for now", "Do not reset or wipe it yet. Resetting can erase the traces an expert needs to confirm what happened."],
    ["Move private conversations to another device", "Use a phone or computer you trust for anything sensitive until an expert has looked."],
    ["Contact a free security helpline", `<a href="https://www.accessnow.org/help/" target="_blank" rel="noopener">Access Now Digital Security Helpline</a> or <a href="https://securitylab.amnesty.org/get-help/" target="_blank" rel="noopener">Amnesty Tech</a>. Share the saved report with them.`],
  ],
  clear: [
    ["Keep the spyware lists up to date", "New spyware is found regularly. Update the lists on the Home screen and check again from time to time."],
    ["Keep your phone updated", "Install system updates as soon as they arrive. They fix the security holes spyware relies on."],
    ["Still worried? Ask an expert", `No tool can prove a phone is clean. <a href="https://www.accessnow.org/help/" target="_blank" rel="noopener">Access Now</a> and <a href="https://securitylab.amnesty.org/get-help/" target="_blank" rel="noopener">Amnesty Tech</a> help people at risk for free.`],
  ],
  failed: [
    ["Check you chose the right thing", "Make sure the location is the backup or collection itself, not a folder above it."],
    ["Check the password", "Encrypted iPhone backups need the exact password chosen when encryption was turned on."],
    ["Look at the technical details", "The Notes tab shows what went wrong. You can share the files with someone who can help."],
  ],
};

async function caseView(id) {
  const c = await api(`/api/cases/${encodeURIComponent(id)}`);
  const s = c.summary;
  const failed = !s.detections.length && (s.completed === false || !s.modules.length);
  const verdict = s.detections.length ? "attention" : failed ? "failed" : "clear";
  const n = s.detection_count;
  const hero = {
    attention: ["shield-alert", "Something to look at", `${n} thing${n === 1 ? "" : "s"} matched known spyware`, "This is not proof that the phone is infected. Some matches turn out to be harmless. An expert can tell you for sure, and the steps below keep the evidence safe until then."],
    clear: ["shield-check", "Check finished", "No known spyware found", "Nothing on this phone matched the spyware lists we used. No tool can promise a phone is clean, because new spyware may not be on the lists yet."],
    failed: ["info", "Check did not finish", "We could not read the phone data", "This usually means the wrong folder was chosen or the backup password was not right. Nothing about the phone itself is known yet."],
  }[verdict];
  const heroCls = verdict === "attention" ? "pf-hero--attention" : verdict === "clear" ? "pf-hero--clear" : "";
  const records = s.modules.reduce((a, m) => a + m.records, 0);
  view.innerHTML = `
    <div class="pf-head"><div><a class="pf-page__back" href="#/cases">${"← Past checks"}</a>
      <h1 class="pf-page__title">${esc(c.label)} ${c.demo ? '<span class="pf-demo-tag">Example data</span>' : ""}</h1>
      <p class="pf-muted">${esc(TYPE_NAMES[c.type] || c.type)} · Checked ${esc(fmtDate(c.created))}</p></div>
      <div class="pf-row"><button class="pf-btn" id="printBtn">${icon("print")}Print report</button><button class="pf-btn" id="openBtn">${icon("folder")}Open folder</button></div></div>
    <section class="pf-hero ${heroCls}" aria-labelledby="heroTitle">
      <div class="pf-hero__mark">${icon(hero[0], "pf-icon-lg")}</div>
      <div><p class="pf-hero__eyebrow">${hero[1]}</p><h2 class="pf-hero__title" id="heroTitle">${hero[2]}</h2><p class="pf-hero__body">${hero[3]}</p>
        <div class="pf-hero__actions">${verdict === "attention" ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="https://www.accessnow.org/help/" target="_blank" rel="noopener">Get free expert help</a><button class="pf-btn pf-btn--lg" data-goto="det">See what matched</button>`
          : verdict === "clear" ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="#/">Done</a>` : `<a class="pf-btn pf-btn--primary pf-btn--lg" href="#/scan">Try again</a><button class="pf-btn pf-btn--lg" data-goto="warn">Show what went wrong</button>`}</div></div>
    </section>
    <section><h2 class="pf-section-title">What to do now</h2>
      <ol class="pf-steps">${NEXT_STEPS[verdict].map(([t, d]) => `<li class="pf-steps__item"><div><p class="pf-steps__title">${t}</p><p class="pf-steps__text">${d}</p></div></li>`).join("")}</ol></section>
    <div class="pf-grid-3">
      <div class="pf-stat"><p class="pf-stat__value">${s.modules.length}</p><p class="pf-stat__label">Parts of the phone checked</p></div>
      <div class="pf-stat"><p class="pf-stat__value">${records.toLocaleString()}</p><p class="pf-stat__label">Items looked at</p></div>
      <div class="pf-stat ${n ? "pf-stat--attention" : "pf-stat--clear"}"><p class="pf-stat__value">${n}</p><p class="pf-stat__label">Matches to look at</p></div>
    </div>
    <section id="details"><h2 class="pf-section-title">Details</h2>
      <div class="pf-tabs" role="tablist">
        ${[["det", `Matches (${n})`], ["mod", "What was checked"], ["tl", `Timeline (${s.timeline.length})`], ["warn", `Notes (${s.warnings.length})`], ["files", "Files"]]
          .map(([k, l]) => `<button class="pf-tab" role="tab" id="tab-${k}" aria-controls="panel-${k}" data-t="${k}">${l}</button>`).join("")}
      </div>
      ${["det", "mod", "tl", "warn", "files"].map((k) => `<div class="pf-tabpanel" role="tabpanel" id="panel-${k}" aria-labelledby="tab-${k}" hidden></div>`).join("")}
    </section>
    ${footer()}`;
  const panels = {
    det: () => s.detections.length ? `<div class="pf-stack-sm">${s.detections.map(findingView).join("")}</div>`
      : `<div class="pf-empty">${icon("shield-check")}<p>Nothing matched the spyware lists.</p></div>`,
    mod: () => s.modules.length ? `<div class="pf-table-wrap"><table class="pf-table"><thead><tr><th>Part of the phone</th><th>What it is</th><th>Items</th></tr></thead><tbody>
      ${s.modules.map((m) => `<tr><td>${esc(pretty(m.name))}</td><td class="pf-muted">${esc(areaOf(m.name))}</td><td>${m.records.toLocaleString()}</td></tr>`).join("")}</tbody></table></div>` : `<p class="pf-muted">Nothing was read.</p>`,
    tl: () => s.timeline.length ? `<div class="pf-table-wrap"><table class="pf-table"><thead><tr>${Object.keys(s.timeline[0]).map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead><tbody>
      ${s.timeline.map((r) => `<tr>${Object.values(r).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="pf-muted">No events to show.</p>`,
    warn: () => s.warnings.length ? `<div class="pf-log" style="max-height:420px">${s.warnings.map(esc).join("\n")}</div>` : `<p class="pf-muted">No notes.</p>`,
    files: () => `<p class="pf-muted">The raw results from MVT. Share these with an expert if you ask for help. They are saved in <span class="pf-mono">${esc(c.path)}</span>.</p>
      <ul class="pf-bullets">${s.files.map((f) => `<li><a class="pf-link" href="/api/cases/${encodeURIComponent(id)}/files/${encodeURIComponent(f)}">${esc(f)}</a></li>`).join("")}</ul>`,
  };
  const show = (t, scroll) => {
    view.querySelectorAll(".pf-tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.t === t));
    view.querySelectorAll(".pf-tabpanel").forEach((p) => (p.hidden = p.id !== "panel-" + t));
    const panel = $("#panel-" + t);
    if (!panel.innerHTML) panel.innerHTML = panels[t]();
    if (scroll) $("#details").scrollIntoView({ behavior: "smooth" });
  };
  view.querySelectorAll(".pf-tab").forEach((b) => (b.onclick = () => show(b.dataset.t)));
  view.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => show(b.dataset.goto, true)));
  show(n ? "det" : failed ? "warn" : "mod");
  $("#printBtn").onclick = () => { Object.keys(panels).forEach((k) => { const p = $("#panel-" + k); if (!p.innerHTML) p.innerHTML = panels[k](); }); window.print(); };
  $("#openBtn").onclick = () => api(`/api/cases/${encodeURIComponent(id)}/open`, { method: "POST" }).catch((e) => toast(e.message));
}

function findingView(d) {
  const rec = d.record || {};
  const m = rec.matched_indicator?.ioc || rec.matched_indicator;
  const fields = Object.entries(rec).filter(([k, v]) => k !== "matched_indicator" && v !== null && v !== "").slice(0, 6);
  const level = (d.level || "HIGH").toLowerCase();
  return `<article class="pf-finding">
    <p class="pf-finding__title">${esc(d.message || "Matched a known spyware sign")}</p>
    <span class="pf-badge ${level === "critical" ? "pf-badge--critical" : "pf-badge--attention"}">${esc(level[0].toUpperCase() + level.slice(1))}</span>
    <p class="pf-finding__meta">Found in ${esc(areaOf(d.module))}${d.time ? ` · ${esc(fmtDate(d.time))}` : ""}</p>
    ${m ? `<p class="pf-finding__body">Matches <b>${esc(m.value || "")}</b>${m.name ? `, linked to <b>${esc(m.name)}</b>` : ""}.</p>` : ""}
    ${fields.length ? `<div class="pf-finding__match pf-mono">${fields.map(([k, v]) => `<div><span class="pf-muted">${esc(k)}:</span> ${esc(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 300)}</div>`).join("")}</div>` : ""}
  </article>`;
}

// ------------------------------------------------------------ history & help
async function casesView() {
  const cases = await api("/api/cases");
  const badge = (c) => c.verdict === "detected" ? `<span class="pf-badge pf-badge--attention">${icon("shield-alert")}${c.detection_count} to look at</span>`
    : c.verdict === "clean" ? `<span class="pf-badge pf-badge--clear">${icon("check")}Nothing found</span>`
    : `<span class="pf-badge">Did not finish</span>`;
  view.innerHTML = `<div class="pf-head"><div><h1 class="pf-page__title">Past checks</h1><p class="pf-muted">Saved on this computer only.</p></div>
      <a class="pf-btn pf-btn--primary pf-btn--lg" href="#/scan">${icon("plus")}New check</a></div>
    ${cases.length ? `<div class="pf-stack-sm">${cases.map((c) => `
      <a class="pf-check" href="#/case/${encodeURIComponent(c.id)}">
        <span class="pf-check__mark ${c.verdict === "detected" ? "pf-check__mark--attention" : c.verdict === "clean" ? "pf-check__mark--clear" : ""}">${icon(c.verdict === "detected" ? "shield-alert" : c.verdict === "clean" ? "shield-check" : "info")}</span>
        <span><p class="pf-check__name">${esc(c.label)}</p><p class="pf-check__meta">${esc(TYPE_NAMES[c.type] || c.type)} · ${esc(fmtDate(c.created))} ${c.demo ? '· <span class="pf-demo-tag">Example data</span>' : ""}</p></span>
        ${badge(c)}<span class="pf-check__chev">${icon("chev-r")}</span></a>`).join("")}</div>`
      : `<div class="pf-empty">${icon("clock")}<p>No checks yet.</p><a class="pf-btn pf-btn--primary" href="#/scan">Start your first check</a></div>`}
    <details class="pf-details"><summary>Where are results saved?</summary><p class="pf-muted">In <span class="pf-mono">${esc(status.cases_dir)}</span>. Delete a folder there to remove a check.</p></details>`;
}

const GUIDES = {
  "iphone-mac": {
    title: "iPhone backup on a Mac", icon: "phone",
    intro: "You need the iPhone, its cable, and a Mac with enough free space for the backup (usually as much as the phone uses).",
    steps: [
      ["Unlock the iPhone and connect it", "Use the charging cable. If the phone asks <b>Trust This Computer?</b>, tap <b>Trust</b> and enter the phone's passcode."],
      ["Open Finder", "Click the iPhone's name in the Finder sidebar, under <b>Locations</b>. Make sure the <b>General</b> tab is open."],
      ["Choose \"Back up all of the data on your iPhone to this Mac\"", "Not iCloud. The backup has to be on this Mac."],
      ["Tick \"Encrypt local backup\" and choose a password", "Write the password down. Encrypted backups include messages, browsing history and other things the check needs. If the box is already ticked, you need the password chosen back then."],
      ["Click \"Back Up Now\" and wait", "Keep the phone connected until the progress bar in the sidebar disappears. It can take from a few minutes to an hour."],
      ["Come back to PhoneForensics", "Start a new check. The backup is usually found automatically. If not, it is in <span class=\"pf-mono\">~/Library/Application Support/MobileSync/Backup/</span>."],
    ],
    trouble: [
      ["PhoneForensics says the folder is not allowed", "macOS protects the backup folder. Open <b>System Settings › Privacy &amp; Security › Full Disk Access</b>, turn on <b>Terminal</b>, then close and reopen PhoneForensics."],
      ["The iPhone does not appear in Finder", "Try another cable or USB port, unlock the phone, and check that macOS is up to date."],
      ["I forgot the backup password", "Apple cannot recover it. On the iPhone, go to Settings › General › Transfer or Reset iPhone › Reset › <b>Reset All Settings</b>. This keeps your data but removes the backup password. Then make a new encrypted backup."],
    ],
  },
  "iphone-windows": {
    title: "iPhone backup on Windows", icon: "phone",
    intro: "You need the iPhone, its cable, and a Windows PC with the free <b>Apple Devices</b> app (Windows 10 or 11) or <b>iTunes</b>, both from the Microsoft Store.",
    steps: [
      ["Install Apple Devices", "Get <b>Apple Devices</b> from the Microsoft Store. On older Windows, install <b>iTunes</b> instead."],
      ["Unlock the iPhone and connect it", "If the phone asks <b>Trust This Computer?</b>, tap <b>Trust</b> and enter the passcode."],
      ["Open the iPhone in Apple Devices", "Click the iPhone in the sidebar, then <b>General</b>. In iTunes, click the small phone button, then <b>Summary</b>."],
      ["Choose \"Back up all of the data on your iPhone to this computer\"", "Not iCloud. The backup has to be on this PC."],
      ["Tick \"Encrypt local backup\" and choose a password", "Write the password down. Encrypted backups include much more of what the check needs."],
      ["Click \"Back Up Now\" and wait", "Keep the phone connected until it has finished."],
      ["Come back to PhoneForensics", "The backup is usually found automatically. If not, look in <span class=\"pf-mono\">%APPDATA%\\Apple Computer\\MobileSync\\Backup</span> or <span class=\"pf-mono\">%USERPROFILE%\\Apple\\MobileSync\\Backup</span>."],
    ],
    trouble: [
      ["The iPhone does not appear", "Unlock it, try another cable or port, and restart the Apple Devices app."],
      ["I forgot the backup password", "On the iPhone, go to Settings › General › Transfer or Reset iPhone › Reset › <b>Reset All Settings</b>. This keeps your data but removes the backup password. Then make a new encrypted backup."],
    ],
  },
  "android-qf": {
    title: "Android data with AndroidQF", icon: "android",
    intro: "AndroidQF is a free tool from Amnesty International that copies what the check needs from an Android phone. You need the phone, a USB cable that carries data, and this computer.",
    steps: [
      ["Turn on Developer options", "On the phone, open <b>Settings › About phone</b> and tap <b>Build number</b> 7 times. On some phones it is under <b>Software information</b>. Enter your PIN if asked."],
      ["Turn on USB debugging", "Open <b>Settings › System › Developer options</b> (or search Settings for \"Developer\") and turn on <b>USB debugging</b>."],
      ["Download AndroidQF", "From <a class=\"pf-link\" href=\"https://github.com/mvt-project/androidqf/releases\" target=\"_blank\" rel=\"noopener\">the AndroidQF releases page</a>, download the file for this computer: <b>windows</b> (.exe), <b>darwin</b> for Mac, or <b>linux</b>. Put it in its own folder."],
      ["Connect the phone and allow debugging", "Unlock the phone and plug it in. When it asks <b>Allow USB debugging?</b>, tick <b>Always allow from this computer</b> and tap <b>Allow</b>."],
      ["Run AndroidQF", "Double-click the file (on a Mac, right-click › Open the first time). Answer its questions. If unsure, choose the default. Keep the phone unlocked and connected while it works."],
      ["Find the new folder", "When it finishes, there is a new folder (with a long name of letters and numbers) next to AndroidQF. Choose that folder in PhoneForensics."],
      ["Turn USB debugging off again", "When you are done, switch <b>USB debugging</b> off in Developer options."],
    ],
    trouble: [
      ["AndroidQF says no device was found", "Check the phone is unlocked, that you tapped <b>Allow</b>, and try a different cable. Some cables only charge."],
      ["Windows or macOS blocks AndroidQF", "Windows: click <b>More info › Run anyway</b>. Mac: right-click the file and choose <b>Open</b>."],
    ],
  },
  "android-bugreport": {
    title: "Android bug report", icon: "bug",
    intro: "A bug report is a quick option that needs no extra software. It contains less than AndroidQF, so use AndroidQF if you can.",
    steps: [
      ["Turn on Developer options", "Open <b>Settings › About phone</b> and tap <b>Build number</b> 7 times."],
      ["Take a full bug report", "Open <b>Settings › System › Developer options</b>, tap <b>Take bug report</b>, choose <b>Full report</b>, then tap <b>Report</b>."],
      ["Wait for the notification", "After a few minutes a notification says the bug report is ready. Tap it and choose how to share it."],
      ["Copy it to this computer", "Send it to yourself or copy it with a cable. It is a <b>.zip</b> file. Do not unzip it."],
      ["Choose the .zip in PhoneForensics", "Start a new check, choose <b>Android › Bug report</b>, and pick the file."],
    ],
    trouble: [
      ["Sharing to email fails", "The file can be large. Copy it with a cable or upload it to a cloud drive you trust instead."],
    ],
  },
};
const GUIDE_FOR = { "ios-backup": ["iphone-mac", "iphone-windows"], "android-qf": ["android-qf"], "android-bugreport": ["android-bugreport"] };

function helpView(which) {
  const g = GUIDES[which];
  if (g) {
    view.innerHTML = `<div><a class="pf-page__back" href="#/help">← Guide</a><h1 class="pf-page__title">${esc(g.title)}</h1></div>
      <p class="pf-body-lg">${g.intro}</p>
      <ol class="pf-steps">${g.steps.map(([t, d]) => `<li class="pf-steps__item"><div><p class="pf-steps__title">${t}</p><p class="pf-steps__text">${d}</p></div></li>`).join("")}</ol>
      <section class="pf-stack-sm"><h2 class="pf-section-title" style="margin:0">If something goes wrong</h2>
        ${g.trouble.map(([q, a]) => `<details class="pf-card"><summary style="cursor:pointer;font-weight:700">${q}</summary><p class="pf-muted" style="margin-top:var(--space-3)">${a}</p></details>`).join("")}</section>
      <div class="pf-row"><a class="pf-btn pf-btn--primary pf-btn--lg" href="#/scan">Start a new check ${icon("chev-r")}</a><button class="pf-btn" onclick="window.print()">${icon("print")}Print these steps</button></div>
      ${footer()}`;
    return;
  }
  view.innerHTML = `<h1 class="pf-page__title">Guide</h1>
    <ol class="pf-steps">
      <li class="pf-steps__item"><div><p class="pf-steps__title">Save the phone's data</p><p class="pf-steps__text">Make an iPhone backup, or collect Android data with AndroidQF. Pick your phone below for step-by-step instructions.</p></div></li>
      <li class="pf-steps__item"><div><p class="pf-steps__title">We check it on this computer</p><p class="pf-steps__text">MVT reads messages, browsing history, apps and system logs, and compares them with lists of known spyware.</p></div></li>
      <li class="pf-steps__item"><div><p class="pf-steps__title">Read the result</p><p class="pf-steps__text">You get a clear answer and plain next steps, plus files you can give to an expert.</p></div></li>
    </ol>
    <section><h2 class="pf-section-title">How to save data from the phone</h2>
      <div class="pf-stack-sm">${Object.entries(GUIDES).map(([id, x]) => `
        <a class="pf-check" href="#/help/${id}"><span class="pf-check__mark" style="background:var(--surface-sunken)">${icon(x.icon)}</span>
          <span><p class="pf-check__name">${esc(x.title)}</p><p class="pf-check__meta">${x.steps.length} steps${id === "android-qf" ? " · Recommended for Android" : id.startsWith("iphone") ? " · Recommended for iPhone" : ""}</p></span>
          <span></span><span class="pf-check__chev">${icon("chev-r")}</span></a>`).join("")}</div></section>
    <section class="pf-card pf-stack"><h2 class="pf-h2">Good to know</h2>
      <ul class="pf-bullets">
        <li><b>Private.</b> Everything happens on this computer. Phone data is never uploaded.</li>
        <li><b>Keep the lists up to date</b> from the Home screen. New spyware is found regularly.</li>
        <li><b>Keep the app up to date</b> with <b>Check for updates</b> on the Home screen.</li>
        <li><b>Nothing found is not a guarantee.</b> If you are at high risk, for example as a journalist, activist or lawyer, also talk to an expert.</li>
        <li><b>Consent.</b> Only check a phone when its owner freely agrees. This is a condition of the <a class="pf-link" href="https://license.mvt.re/1.1/" target="_blank" rel="noopener">MVT License</a>.</li>
      </ul></section>
    <section class="pf-card pf-stack"><h2 class="pf-h2">Get help</h2>
      <ul class="pf-bullets">
        <li><a class="pf-link" href="https://www.accessnow.org/help/" target="_blank" rel="noopener">Access Now Digital Security Helpline</a>: free, 24/7, in many languages.</li>
        <li><a class="pf-link" href="https://securitylab.amnesty.org/get-help/" target="_blank" rel="noopener">Amnesty International Security Lab</a>: for human rights defenders and civil society.</li>
        <li><a class="pf-link" href="https://docs.mvt.re" target="_blank" rel="noopener">MVT documentation</a>: for technical users.</li>
      </ul></section>
    ${footer()}`;
}

loadStatus().then(route).catch((e) => { view.innerHTML = `<div class="pf-note">${icon("info")}<p style="margin:0">Could not reach PhoneForensics: ${esc(e.message)}</p></div>`; });
