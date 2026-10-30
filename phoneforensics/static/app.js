const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  setTimeout(() => d.remove(), 3500);
};
let status = null;

// ------------------------------------------------------------ evidence types
const EVIDENCE = {
  iphone: [
    {
      type: "ios-backup", ico: "💾", title: "iPhone backup", tag: "Recommended",
      desc: "A backup made with Finder (Mac) or iTunes / Apple Devices (Windows).",
      how: [
        "Connect the iPhone to this computer with a cable and tap <b>Trust</b> on the phone.",
        "Mac: open <b>Finder</b> and click the iPhone in the sidebar. Windows: open <b>Apple Devices</b> or <b>iTunes</b>.",
        "Tick <b>Encrypt local backup</b> and choose a password you'll remember — encrypted backups contain far more evidence.",
        "Click <b>Back Up Now</b> and wait for it to finish, then come back here.",
      ],
      pick: "folder", password: "Backup password (only if the backup is encrypted)",
    },
    {
      type: "ios-fs", ico: "🗄️", title: "Full file system dump", desc: "For experts: an extracted iOS filesystem (e.g. from a jailbroken device).",
      how: ["Point us at the folder containing the extracted filesystem."], pick: "folder",
    },
  ],
  android: [
    {
      type: "android-qf", ico: "📦", title: "AndroidQF collection", tag: "Recommended",
      desc: "Data collected with the free AndroidQF tool from Amnesty International.",
      how: [
        "On the phone, enable <b>Developer options</b> (tap <i>Build number</i> 7 times in Settings › About phone) and turn on <b>USB debugging</b>.",
        "Download <a href=\"https://github.com/mvt-project/androidqf/releases\" target=\"_blank\">AndroidQF</a> for your computer and run it with the phone connected.",
        "Accept the prompt on the phone, and follow the AndroidQF questions.",
        "When finished it creates a folder (or .zip) — choose that here.",
      ],
      pick: "any",
    },
    {
      type: "android-bugreport", ico: "🐞", title: "Bug report", desc: "A bug report .zip generated from Developer options.",
      how: ["Settings › Developer options › <b>Take bug report</b> › Full report.", "Copy the .zip to this computer and choose it here."], pick: "file",
    },
    {
      type: "android-backup", ico: "💾", title: "Android backup (.ab)", desc: "A backup file created with <code>adb backup</code>.",
      how: ["Choose the <b>.ab</b> backup file."], pick: "file", password: "Backup password (if any)",
    },
  ],
};

// ------------------------------------------------------------ routing
const routes = { "": home, scan: scanWizard, cases: casesView, case: caseView, job: jobView, help: helpView };
async function route() {
  $("#browser").hidden = true;
  const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === (name || "home") || (name === "case" && a.dataset.nav === "cases")));
  view.innerHTML = "";
  await (routes[name] || home)(decodeURIComponent(arg || ""));
}
window.addEventListener("hashchange", route);

async function loadStatus() {
  status = await api("/api/status");
  const iocs = status.iocs.count ? `<span class="dot"></span>${status.iocs.count} threat lists` : `<span class="dot" style="background:var(--warn)"></span>No threat lists yet`;
  $("#sideStatus").innerHTML = `${iocs}<br>MVT ${esc(status.mvt || "not installed")}`;
}

// ------------------------------------------------------------ home
async function home() {
  const cases = await api("/api/cases");
  const flagged = cases.filter((c) => c.verdict === "detected").length;
  const iocs = status.iocs;
  view.innerHTML = `<div class="wrap">
    <section class="hero">
      <div>
        <h1>Is your phone being spied on?</h1>
        <p>PhoneForensics checks iPhones and Android phones for traces of known spyware such as Pegasus and Predator, using Amnesty International's Mobile Verification Toolkit — no command line needed.</p>
        <div class="row" style="margin-top:18px"><a class="btn primary lg" href="#/scan">Start a new check →</a><a class="btn ghost" href="#/help">How does it work?</a></div>
      </div>
      <div class="hero-shield">🛡️</div>
    </section>
    ${status.mvt ? "" : `<div class="warn-box">⚠️ MVT isn't installed in this Python environment. Run <code>pip install mvt</code> and restart PhoneForensics.</div>`}
    <div class="grid g3">
      <div class="card stat"><div class="num">${iocs.count}</div><div class="lbl">Threat indicator lists ${iocs.updated ? "· updated " + esc(iocs.updated.replace("T", " ")) : ""}</div>
        <button class="btn sm" style="margin-top:12px" id="updIoc">${iocs.count ? "↻ Update now" : "⬇ Download now"}</button></div>
      <div class="card stat"><div class="num">${cases.length}</div><div class="lbl">Checks performed</div><a class="btn sm ghost" style="margin-top:12px" href="#/cases">View history</a></div>
      <div class="card stat"><div class="num" style="color:${flagged ? "var(--bad)" : "var(--ok)"}">${flagged}</div><div class="lbl">Checks with suspicious findings</div></div>
    </div>
    ${!iocs.count ? `<div class="warn-box" style="margin-top:16px">💡 <b>First time?</b> Download the latest threat indicators before your first check — without them, MVT can extract data but can't recognise known spyware.</div>` : ""}
  </div>`;
  $("#updIoc").onclick = updateIocs;
}

async function updateIocs() {
  const job = await api("/api/iocs/update", { method: "POST" });
  location.hash = `#/job/${job.id}`;
}

// ------------------------------------------------------------ scan wizard
const wiz = { step: 0, device: null, ev: null, path: "", password: "", label: "", fast: false };

async function scanWizard() {
  Object.assign(wiz, { step: 0, device: null, ev: null, path: "", password: "", label: "", fast: false });
  renderWizard();
}

function renderWizard() {
  const bars = [0, 1, 2, 3].map((i) => `<div class="${i <= wiz.step ? "on" : ""}"></div>`).join("");
  const body = [stepDevice, stepEvidence, stepLocate, stepConfirm][wiz.step]();
  view.innerHTML = `<div class="wrap"><h1>New check</h1><div class="steps">${bars}</div>${body}</div>`;
  bindWizard();
}

function stepDevice() {
  return `<div class="step-label">Step 1 of 4</div><h2>Which kind of phone are you checking?</h2>
  <div class="grid g2" style="margin-top:16px">
    <div class="card choice ${wiz.device === "iphone" ? "sel" : ""}" data-device="iphone"><div class="ico">📱</div><h3>iPhone</h3><p class="muted">Any iPhone or iPad running iOS / iPadOS.</p></div>
    <div class="card choice ${wiz.device === "android" ? "sel" : ""}" data-device="android"><div class="ico">🤖</div><h3>Android</h3><p class="muted">Samsung, Pixel, Xiaomi, OnePlus and other Android phones.</p></div>
  </div>
  <div class="actions"><span></span><button class="btn primary" data-next ${wiz.device ? "" : "disabled"}>Continue →</button></div>`;
}

function stepEvidence() {
  const list = EVIDENCE[wiz.device];
  return `<div class="step-label">Step 2 of 4</div><h2>What have you got from the phone?</h2>
  <p class="muted">Not sure? Pick the recommended option — we'll walk you through creating it.</p>
  <div class="grid ${list.length === 3 ? "g3" : "g2"}" style="margin-top:16px">${list.map((e) => `
    <div class="card choice ${wiz.ev?.type === e.type ? "sel" : ""}" data-ev="${e.type}">${e.tag ? `<span class="tag">${e.tag}</span>` : ""}
      <div class="ico">${e.ico}</div><h3>${e.title}</h3><p class="muted">${e.desc}</p></div>`).join("")}</div>
  <div class="actions"><button class="btn ghost" data-back>← Back</button><button class="btn primary" data-next ${wiz.ev ? "" : "disabled"}>Continue →</button></div>`;
}

function stepLocate() {
  const e = wiz.ev;
  return `<div class="step-label">Step 3 of 4</div><h2>${e.title}</h2>
  <div class="how"><b>How to get it</b><ol>${e.how.map((h) => `<li>${h}</li>`).join("")}</ol></div>
  ${e.type === "ios-backup" ? `<div id="found"><p class="muted">Looking for iPhone backups on this computer…</p></div>` : ""}
  <label class="field"><span>Location</span>
    <div class="picker"><input type="text" id="pathIn" value="${esc(wiz.path)}" placeholder="Click Browse… to choose"><button class="btn" id="browseBtn">📁 Browse…</button></div></label>
  <div id="pathInfo"></div>
  ${e.password ? `<label class="field"><span>${e.password}</span><input type="password" id="pwIn" value="${esc(wiz.password)}" autocomplete="off"></label>` : ""}
  <div class="actions"><button class="btn ghost" data-back>← Back</button><button class="btn primary" data-next ${wiz.path ? "" : "disabled"}>Continue →</button></div>`;
}

function stepConfirm() {
  return `<div class="step-label">Step 4 of 4</div><h2>Ready to check</h2>
  <div class="card">
    <label class="field" style="margin-top:0"><span>Give this check a name</span><input type="text" id="labelIn" value="${esc(wiz.label)}" placeholder="e.g. Maria's iPhone"></label>
    <table><tr><th>Phone</th><td>${wiz.device === "iphone" ? "iPhone" : "Android"}</td></tr>
      <tr><th>Evidence</th><td>${wiz.ev.title}</td></tr>
      <tr><th>Location</th><td><code>${esc(wiz.path)}</code></td></tr>
      <tr><th>Password</th><td>${wiz.password ? "Provided ✓" : "None"}</td></tr>
      <tr><th>Threat lists</th><td>${status.iocs.count ? `${status.iocs.count} lists loaded <span class="pill ok">ready</span>` : `<span class="pill warn">none downloaded</span> — results won't flag known spyware`}</td></tr></table>
    ${wiz.device === "iphone" ? `<label class="toggle"><input type="checkbox" id="fastIn" ${wiz.fast ? "checked" : ""}> Quick mode (skip slow checks)</label>` : ""}
  </div>
  <label class="consent card"><input type="checkbox" id="consentIn"> <span><b>The owner of this phone has agreed to this check.</b><br><span class="muted">They know what will be analysed and how the results will be stored. Checking someone else's phone without their free and informed consent is not allowed by the <a href="https://license.mvt.re/1.1/" target="_blank">MVT License</a> and may be illegal.</span></span></label>
  <p class="muted">🔒 Everything runs on this computer. Nothing from the phone is uploaded anywhere.</p>
  <div class="actions"><button class="btn ghost" data-back>← Back</button><button class="btn primary lg" id="runBtn" disabled>🔍 Start check</button></div>`;
}

function bindWizard() {
  view.querySelectorAll("[data-device]").forEach((el) => (el.onclick = () => { if (wiz.device !== el.dataset.device) wiz.ev = null; wiz.device = el.dataset.device; renderWizard(); }));
  view.querySelectorAll("[data-ev]").forEach((el) => (el.onclick = () => { wiz.ev = EVIDENCE[wiz.device].find((e) => e.type === el.dataset.ev); wiz.path = ""; renderWizard(); }));
  const save = () => {
    if ($("#pathIn")) wiz.path = $("#pathIn").value.trim();
    if ($("#pwIn")) wiz.password = $("#pwIn").value;
    if ($("#labelIn")) wiz.label = $("#labelIn").value;
    if ($("#fastIn")) wiz.fast = $("#fastIn").checked;
  };
  view.querySelector("[data-next]")?.addEventListener("click", () => { save(); wiz.step++; renderWizard(); });
  view.querySelector("[data-back]")?.addEventListener("click", () => { save(); wiz.step--; renderWizard(); });
  const pathIn = $("#pathIn");
  if (pathIn) {
    pathIn.oninput = () => { wiz.path = pathIn.value.trim(); view.querySelector("[data-next]").disabled = !wiz.path; };
    $("#browseBtn").onclick = () => openBrowser(wiz.ev.pick, wiz.path, (p, info) => { wiz.path = p; save(); pathIn.value = p; pathIn.oninput(); showBackupInfo(info); });
  }
  if ($("#found")) findBackups();
  $("#runBtn")?.addEventListener("click", startScan);
  $("#consentIn")?.addEventListener("change", (e) => ($("#runBtn").disabled = !e.target.checked));
}

function showBackupInfo(info) {
  const el = $("#pathInfo");
  if (!el) return;
  el.innerHTML = info ? `<div class="pill ${info.encrypted ? "ok" : "warn"}">${info.encrypted ? "🔒 Encrypted backup — enter its password below" : "Unencrypted backup — fewer records can be checked"}</div>` : "";
}

async function findBackups() {
  const list = await api("/api/ios-backups").catch(() => []);
  const el = $("#found");
  if (!el) return;
  if (!list.length) { el.innerHTML = `<p class="muted">No backups found in the usual places — use <b>Browse…</b> to choose one.</p>`; return; }
  el.innerHTML = `<b>Backups found on this computer</b><div style="margin-top:8px">${list.map((b, i) => `
    <div class="backup ${wiz.path === b.path ? "sel" : ""}" data-i="${i}"><div style="font-size:28px">📱</div>
      <div style="flex:1"><b>${esc(b.name)}</b><div class="muted" style="font-size:13px">${esc(b.model || "")} ${b.ios ? "· iOS " + esc(b.ios) : ""} ${b.date ? "· " + esc(b.date.replace("T", " ")) : ""}</div></div>
      ${b.encrypted ? `<span class="pill ok">🔒 Encrypted</span>` : `<span class="pill warn">Not encrypted</span>`}</div>`).join("")}</div>`;
  el.querySelectorAll(".backup").forEach((row) => (row.onclick = () => {
    const b = list[row.dataset.i];
    wiz.path = b.path; $("#pathIn").value = b.path; $("#pathIn").oninput();
    el.querySelectorAll(".backup").forEach((r) => r.classList.toggle("sel", r === row));
    showBackupInfo(b);
  }));
}

async function startScan() {
  wiz.label = $("#labelIn").value.trim();
  wiz.fast = $("#fastIn")?.checked || false;
  try {
    const job = await api("/api/scan", { method: "POST", body: JSON.stringify({ type: wiz.ev.type, path: wiz.path, password: wiz.password, label: wiz.label, fast: wiz.fast, consent: $("#consentIn").checked }) });
    wiz.password = "";
    location.hash = `#/job/${job.id}`;
  } catch (e) { toast(e.message); }
}

// ------------------------------------------------------------ file browser
let browserState = null;
async function openBrowser(mode, start, done) {
  browserState = { mode, done, selected: null, data: null };
  $("#browser").hidden = false;
  await browseTo(start || status.home);
}
async function browseTo(path) {
  try {
    const data = await api("/api/browse?path=" + encodeURIComponent(path));
    browserState.data = data; browserState.selected = null;
    $("#pathInput").value = data.path === "::drives" ? "" : data.path;
    $("#fileList").innerHTML = data.entries.map((e, i) => `<div data-i="${i}" class="${e.dir ? "" : "file"}">${e.dir ? "📁" : "📄"} ${esc(e.name)}</div>`).join("") || `<div class="muted">This folder is empty.</div>`;
    $("#fileList").querySelectorAll("[data-i]").forEach((row) => {
      const entry = data.entries[row.dataset.i];
      row.onclick = () => { browserState.selected = entry; $("#fileList").querySelectorAll(".sel").forEach((r) => r.classList.remove("sel")); row.classList.add("sel"); updatePick(); };
      row.ondblclick = () => entry.dir && browseTo(entry.path);
    });
    updatePick();
  } catch (e) { toast(e.message); }
}
function updatePick() {
  const { mode, selected, data } = browserState;
  const btn = $("#pickBtn");
  if (selected && !selected.dir) { btn.textContent = "Use this file"; btn.disabled = mode === "folder"; }
  else if (selected) { btn.textContent = "Open folder"; btn.disabled = false; }
  else { btn.textContent = "Use this folder"; btn.disabled = mode === "file" || data.path === "::drives"; }
  $("#browserHint").textContent = data.is_ios_backup ? "✅ This looks like an iPhone backup" : mode === "file" ? "Select a file" : "Double-click to open folders";
}
$("#pickBtn").onclick = () => {
  const { selected, data, done } = browserState;
  if (selected?.dir) return browseTo(selected.path);
  const path = selected ? selected.path : data.path;
  $("#browser").hidden = true;
  done(path, selected ? null : data.ios_backup);
};
$("#upBtn").onclick = () => browserState.data.parent && browseTo(browserState.data.parent);
$("#goBtn").onclick = () => browseTo($("#pathInput").value);
$("#pathInput").onkeydown = (e) => e.key === "Enter" && browseTo($("#pathInput").value);
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => ($("#browser").hidden = true)));

// ------------------------------------------------------------ live job
const PHASES = [
  [/decrypt/i, "Unlocking the encrypted backup"], [/download/i, "Downloading threat indicators"],
  [/Loaded|indicators/i, "Loading threat indicators"], [/Running module|Extracting|Parsing|Found/i, "Analysing phone data"],
];
async function jobView(id) {
  const job = await api(`/api/jobs/${id}`).catch(() => null);
  if (!job) { view.innerHTML = `<div class="wrap empty"><div class="ico">🤷</div><p>This task is no longer running.</p><a class="btn" href="#/cases">See past checks</a></div>`; return; }
  view.innerHTML = `<div class="wrap">
    <h1>${esc(job.title)}</h1>
    <div class="card" style="padding:36px">
      <div class="progress-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="rgba(255,255,255,.08)" stroke-width="7" fill="none"/>
        <circle cx="50" cy="50" r="44" stroke="url(#pg)" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="90 400"/>
        <defs><linearGradient id="pg"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs></svg><div class="center">${job.kind === "scan" ? "🔍" : "⬇"}</div></div>
      <div class="scanning-text"><div class="phase" id="phase">Starting…</div><div class="muted" id="sub">This can take several minutes. You can keep this window open.</div>
        <div class="row" style="justify-content:center;margin-top:12px"><span class="pill" id="counter">0 steps</span><span class="pill bad" id="alerts" hidden></span><span class="pill" id="elapsed">0:00</span></div></div>
      <details><summary>Show technical details</summary><div class="log" id="log"></div></details>
      <div style="text-align:center;margin-top:16px"><button class="btn sm ghost danger" id="cancelBtn">Cancel</button></div>
    </div></div>`;
  const log = $("#log"); let steps = 0, alerts = 0;
  const timer = setInterval(() => { const s = Math.floor(Date.now() / 1000 - job.started); $("#elapsed") && ($("#elapsed").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`); }, 1000);
  $("#cancelBtn").onclick = () => api(`/api/jobs/${id}/cancel`, { method: "POST" });
  const es = new EventSource(`/api/jobs/${id}/stream`);
  es.onmessage = (m) => {
    const { line } = JSON.parse(m.data);
    const div = document.createElement("div");
    div.className = /CRITICAL|ALERT|detected/i.test(line) ? "c" : /WARNING/.test(line) ? "w" : /INFO/.test(line) ? "i" : "";
    div.textContent = line; log.append(div); log.scrollTop = log.scrollHeight;
    if (/CRITICAL|matching indicators|Detected/i.test(line)) { alerts++; $("#alerts").hidden = false; $("#alerts").textContent = `${alerts} alert${alerts > 1 ? "s" : ""}`; }
    const mod = line.match(/(?:Running module|Loading results from|module)\s+([A-Za-z]+)/i) || line.match(/\[mvt\.\w+\.modules\.[\w.]+\.(\w+)\]/);
    if (mod) $("#sub").textContent = "Checking: " + mod[1].replace(/([a-z])([A-Z])/g, "$1 $2");
    for (const [re, label] of PHASES) if (re.test(line)) { $("#phase").textContent = label + "…"; break; }
    $("#counter").textContent = `${++steps} steps`;
  };
  es.addEventListener("done", (m) => {
    es.close(); clearInterval(timer);
    const done = JSON.parse(m.data);
    if (done.kind === "iocs") {
      loadStatus(); toast(done.status === "done" ? "Threat indicators updated ✓" : "Couldn't update indicators — check your internet connection.");
      location.hash = "#/";
    } else if (done.case_dir) {
      location.hash = `#/case/${encodeURIComponent(done.case_dir.split(/[\\/]/).pop())}`;
    }
  });
  window.addEventListener("hashchange", () => { es.close(); clearInterval(timer); }, { once: true });
}

// ------------------------------------------------------------ results
const MODULE_HELP = {
  Safari: "websites visited in Safari", SMS: "text messages and links", WhatsApp: "WhatsApp links", Calendar: "calendar entries",
  Datausage: "app network usage", NetUsage: "app network usage", OSAnalytics: "crash and analytics logs", Shutdown: "shutdown logs",
  Processes: "running processes", Packages: "installed apps", Manifest: "the backup file list", Configuration: "configuration profiles",
  Chrome: "Chrome browsing history", TCC: "app privacy permissions", Webkit: "browser data", Interaction: "app interactions",
};
const explain = (name) => { const k = Object.keys(MODULE_HELP).find((k) => name.toLowerCase().includes(k.toLowerCase())); return k ? MODULE_HELP[k] : ""; };
const pretty = (s) => s.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());

async function caseView(id) {
  const c = await api(`/api/cases/${encodeURIComponent(id)}`);
  const s = c.summary; const failed = !s.detections.length && (s.completed === false || !s.modules.length);
  const verdict = s.verdict === "detected" ? "detected" : failed ? "failed" : "clean";
  const head = {
    detected: ["🚨", "Suspicious traces found", `MVT matched <b>${s.detection_count}</b> record(s) against known spyware indicators. This is not proof of infection, but it should be taken seriously — stop using the phone for sensitive communication and contact an expert such as <a href="https://www.accessnow.org/help/" target="_blank">Access Now's Digital Security Helpline</a> or <a href="https://securitylab.amnesty.org/get-help/" target="_blank">Amnesty Tech</a>.`],
    clean: ["✅", "No known spyware found", "None of the checked records matched the threat indicators that were loaded. No tool can guarantee a phone is clean — new spyware may not be known yet — so repeat the check after updating indicators from time to time."],
    failed: ["⚠️", "The check couldn't finish", "MVT wasn't able to read any data. Check that you chose the right folder or file and, for encrypted backups, the correct password. Technical details are below."],
  }[verdict];
  view.innerHTML = `<div class="wrap">
    <div class="row between"><div><a href="#/cases" class="muted">← Past checks</a><h1 style="margin-top:6px">${esc(c.label)}</h1></div>
      <div class="row"><button class="btn sm" id="openBtn">📂 Open folder</button><button class="btn sm" onclick="window.print()">🖨 Print report</button></div></div>
    <p class="muted">${esc(c.created?.replace("T", " ").slice(0, 16))} · <code>${esc(c.source)}</code></p>
    <section class="verdict ${verdict}"><div class="big">${head[0]}</div><div><h2>${head[1]}</h2><p style="margin:0">${head[2]}</p></div></section>
    <div class="grid g3" style="margin-bottom:20px">
      <div class="card stat"><div class="num">${s.modules.length}</div><div class="lbl">Areas of the phone checked</div></div>
      <div class="card stat"><div class="num">${s.modules.reduce((a, m) => a + m.records, 0).toLocaleString()}</div><div class="lbl">Records analysed</div></div>
      <div class="card stat"><div class="num" style="color:${s.detection_count ? "var(--bad)" : "var(--ok)"}">${s.detection_count}</div><div class="lbl">Suspicious matches</div></div>
    </div>
    <div class="card"><div class="tabs" id="tabs">
      <button data-t="det" class="on">🚨 Findings (${s.detection_count})</button><button data-t="mod">📋 What was checked</button>
      <button data-t="tl">🕒 Timeline (${s.timeline.length})</button><button data-t="warn">⚠️ Notes (${s.warnings.length})</button><button data-t="files">📄 Files</button></div>
      <div id="tabBody"></div></div></div>`;
  const tabs = {
    det: () => s.detections.length ? `<table><tr><th>Severity</th><th>Area</th><th>What matched</th></tr>${s.detections.map((d) => `<tr><td><span class="pill bad">${esc(d.level || "ALERT")}</span></td><td><b>${esc(pretty(d.module.split(".").pop()))}</b>${d.time ? `<div class="muted">${esc(d.time)}</div>` : ""}</td><td>${d.message ? `<div style="margin-bottom:6px">${esc(d.message)}</div>` : ""}${recordView(d.record)}</td></tr>`).join("")}</table>`
      : `<div class="empty"><div class="ico">🎉</div><p>No suspicious matches.</p></div>`,
    mod: () => `<table><tr><th>Area</th><th>Description</th><th>Records</th></tr>${s.modules.map((m) => `<tr><td>${esc(pretty(m.name))}</td><td class="muted">${explain(m.name)}</td><td>${m.records.toLocaleString()}</td></tr>`).join("")}</table>`,
    tl: () => s.timeline.length ? `<table><tr>${Object.keys(s.timeline[0]).map((k) => `<th>${esc(k)}</th>`).join("")}</tr>${s.timeline.map((r) => `<tr>${Object.values(r).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="muted">No suspicious events on the timeline.</p>`,
    warn: () => s.warnings.length ? `<ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : `<p class="muted">No warnings.</p>`,
    files: () => `<p class="muted">Raw MVT output, useful to share with an expert. Saved in <code>${esc(c.path)}</code></p>${s.files.map((f) => `<div><a href="/api/cases/${encodeURIComponent(id)}/files/${encodeURIComponent(f)}">${esc(f)}</a></div>`).join("")}`,
  };
  const show = (t) => { $("#tabBody").innerHTML = tabs[t](); $("#tabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === t)); };
  $("#tabs").querySelectorAll("button").forEach((b) => (b.onclick = () => show(b.dataset.t)));
  show(s.detection_count ? "det" : "mod");
  $("#openBtn").onclick = () => api(`/api/cases/${encodeURIComponent(id)}/open`, { method: "POST" }).catch((e) => toast(e.message));
}

function recordView(rec) {
  if (typeof rec !== "object" || !rec) return `<code>${esc(rec)}</code>`;
  const m = rec.matched_indicator?.ioc || rec.matched_indicator;
  const head = m ? `<div class="pill bad" style="display:inline-block;margin-bottom:6px">Matches ${esc(m.type || "indicator")} <b>${esc(m.value || "")}</b>${m.name ? " · " + esc(m.name) : ""}</div>` : "";
  const rows = Object.entries(rec).filter(([k]) => k !== "matched_indicator").slice(0, 8)
    .map(([k, v]) => `<div><span class="muted">${esc(k)}:</span> <code>${esc(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 300)}</code></div>`).join("");
  return head + rows;
}

// ------------------------------------------------------------ history & help
async function casesView() {
  const cases = await api("/api/cases");
  view.innerHTML = `<div class="wrap"><div class="row between"><h1>Past checks</h1><a class="btn primary" href="#/scan">+ New check</a></div>
    <p class="muted">Results are saved in <code>${esc(status.cases_dir)}</code></p>
    ${cases.length ? cases.map((c) => `<div class="case-row" data-id="${esc(c.id)}"><div class="ico">${c.verdict === "detected" ? "🚨" : c.verdict === "clean" ? "✅" : "⚠️"}</div>
      <div class="grow"><b>${esc(c.label)}</b><div class="muted" style="font-size:13px">${esc(c.type)} · ${esc(c.created?.replace("T", " ").slice(0, 16))}</div></div>
      <span class="pill ${c.verdict === "detected" ? "bad" : c.verdict === "clean" ? "ok" : "warn"}">${c.verdict === "detected" ? c.detection_count + " findings" : c.verdict}</span></div>`).join("")
      : `<div class="empty"><div class="ico">🗂️</div><p>No checks yet.</p><a class="btn primary" href="#/scan">Run your first check</a></div>`}</div>`;
  view.querySelectorAll(".case-row").forEach((r) => (r.onclick = () => (location.hash = `#/case/${encodeURIComponent(r.dataset.id)}`)));
}

function helpView() {
  view.innerHTML = `<div class="wrap"><h1>Guide</h1>
  <div class="grid g3" style="margin:18px 0">
    <div class="card"><div style="font-size:34px">1️⃣</div><h3>Get data from the phone</h3><p class="muted">Make an iPhone backup, or collect Android data with AndroidQF. The wizard explains how.</p></div>
    <div class="card"><div style="font-size:34px">2️⃣</div><h3>We check it</h3><p class="muted">MVT reads messages, browsing history, app data and system logs, comparing them to known spyware indicators.</p></div>
    <div class="card"><div style="font-size:34px">3️⃣</div><h3>Read the result</h3><p class="muted">A clear verdict, with the details you can hand to an expert if anything looks wrong.</p></div>
  </div>
  <div class="card"><h3>Good to know</h3><ul>
    <li><b>Privacy:</b> everything happens on this computer. Phone data is never uploaded.</li>
    <li><b>Keep indicators up to date</b> from the Home screen — new spyware is discovered regularly.</li>
    <li><b>iPhone users:</b> encrypted backups contain much more evidence. The password is only used locally to unlock the backup.</li>
    <li><b>A clean result is not a guarantee.</b> If you are at high risk (journalist, activist, lawyer), also contact a specialist.</li>
    <li><b>Consent:</b> only check a phone with the owner's free and informed consent. This is a condition of the <a href="https://license.mvt.re/1.1/" target="_blank">MVT License</a>.</li>
    <li>Need help? <a href="https://www.accessnow.org/help/" target="_blank">Access Now Helpline</a> · <a href="https://securitylab.amnesty.org/get-help/" target="_blank">Amnesty Security Lab</a> · <a href="https://docs.mvt.re" target="_blank">MVT documentation</a></li>
  </ul></div>
  <p class="muted" style="margin-top:18px">PhoneForensics by Surinder Lall · MIT License · Built on <a href="https://github.com/mvt-project/mvt" target="_blank">MVT</a> by Amnesty International (MVT License 1.1). Not affiliated with or endorsed by Amnesty International.</p></div>`;
}

loadStatus().then(route).catch((e) => { view.innerHTML = `<div class="wrap warn-box">Couldn't reach PhoneForensics: ${esc(e.message)}</div>`; });
document.addEventListener("keydown", (e) => e.key === "Escape" && ($("#browser").hidden = true));
