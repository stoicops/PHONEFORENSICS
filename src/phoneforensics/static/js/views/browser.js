// Modal folder/file picker backed by /api/browse. Traps focus while open and restores it on close.

import { api, errorMessage } from "../api.js";
import { find, findAll, icon, toast } from "../dom.js";
import { html, setHtml } from "../html.js";

/** @typedef {import("../api.js").BrowseResult} BrowseResult */
/** @typedef {import("../api.js").BrowseEntry} BrowseEntry */
/** @typedef {import("../api.js").BackupInfo} BackupInfo */
/** @typedef {(path: string, backup: BackupInfo | null) => void} OnPick */

const WINDOWS_DRIVES = "::drives";
const FOCUSABLE = "button:not([disabled]), input, [tabindex='0'], a[href]";

const modal = find("#browser", HTMLElement);
const dialog = find(".pf-dialog", HTMLElement, modal);
const title = find("#browserTitle", HTMLElement);
const list = find("#fileList", HTMLUListElement);
const pathInput = find("#pathInput", HTMLInputElement);
const hint = find("#browserHint", HTMLElement);
const pickButton = find("#pickBtn", HTMLButtonElement);
const upButton = find("#upBtn", HTMLButtonElement);

/** @type {{ mode: "folder" | "file" | "any", onPick: OnPick, data: BrowseResult | null, selected: BrowseEntry | null, returnFocus: Element | null } | null} */
let state = null;

/**
 * @param {{ mode: "folder" | "file" | "any", title: string, start: string, onPick: OnPick }} options
 */
export async function openBrowser(options) {
  state = {
    mode: options.mode,
    onPick: options.onPick,
    data: null,
    selected: null,
    returnFocus: document.activeElement,
  };
  title.textContent = options.title;
  modal.hidden = false;
  await browseTo(options.start);
  pathInput.focus();
}

export function closeBrowser() {
  if (modal.hidden) return;
  modal.hidden = true;
  if (state?.returnFocus instanceof HTMLElement) state.returnFocus.focus();
  state = null;
}

/** @param {string} path */
async function browseTo(path) {
  if (!state) return;
  try {
    const data = await api.browse(path);
    state.data = data;
    state.selected = null;
    pathInput.value = data.path === WINDOWS_DRIVES ? "" : data.path;
    setHtml(
      list,
      data.entries.length
        ? html`${data.entries.map(
            (entry, index) =>
              html`<li role="option" tabindex="0" aria-selected="false" data-index="${index}" class="${entry.dir ? "" : "is-file"}">${icon(entry.dir ? "folder" : "file")}<span>${entry.name}</span></li>`,
          )}`
        : html`<li class="is-file">This folder is empty.</li>`,
    );
    updatePickButton();
  } catch (error) {
    toast(errorMessage(error));
  }
}

/** @param {HTMLElement} row */
function select(row) {
  if (!state?.data) return;
  state.selected = state.data.entries[Number(row.dataset.index)] ?? null;
  for (const other of findAll("[aria-selected]", HTMLElement, list)) other.setAttribute("aria-selected", "false");
  row.setAttribute("aria-selected", "true");
  updatePickButton();
}

function updatePickButton() {
  if (!state?.data) return;
  const { mode, selected, data } = state;
  if (selected && !selected.dir) {
    pickButton.textContent = "Use this file";
    pickButton.disabled = mode === "folder";
  } else {
    pickButton.textContent = "Use this folder";
    pickButton.disabled = mode === "file" || (!selected && data.path === WINDOWS_DRIVES);
  }
  hint.textContent = data.is_ios_backup
    ? 'This folder is an iPhone backup. Click "Use this folder".'
    : mode === "file"
      ? "Open folders with a double-click, then select the file."
      : "Open a folder with a double-click. Select the one named after the phone.";
}

/** @param {Event} event */
function rowFrom(event) {
  const target = event.target instanceof Element ? event.target.closest("[data-index]") : null;
  return target instanceof HTMLElement ? target : null;
}

list.addEventListener("click", (event) => {
  const row = rowFrom(event);
  if (row) select(row);
});
list.addEventListener("dblclick", (event) => {
  const row = rowFrom(event);
  const entry = row && state?.data?.entries[Number(row.dataset.index)];
  if (entry?.dir) void browseTo(entry.path);
});
list.addEventListener("keydown", (event) => {
  const row = rowFrom(event);
  if (!row) return;
  const entry = state?.data?.entries[Number(row.dataset.index)];
  if (event.key === "Enter" && entry?.dir) void browseTo(entry.path);
  else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    select(row);
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const next = event.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling;
    if (next instanceof HTMLElement) next.focus();
  }
});

pickButton.addEventListener("click", async () => {
  if (!state?.data) return;
  const { selected, data, onPick } = state;
  let path = data.path;
  let backup = data.ios_backup ?? null;
  if (selected) {
    path = selected.path;
    backup = selected.dir ? ((await api.browse(path).catch(() => null))?.ios_backup ?? null) : null;
  }
  closeBrowser();
  onPick(path, backup);
});
upButton.addEventListener("click", () => {
  const parent = state?.data?.parent;
  if (parent) void browseTo(parent);
});
pathInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") void browseTo(pathInput.value);
});
for (const button of findAll("[data-close]", HTMLButtonElement, modal)) button.addEventListener("click", closeBrowser);
modal.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeBrowser();
  if (event.key !== "Tab") return;
  const focusable = findAll(FOCUSABLE, HTMLElement, dialog);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
});
document.addEventListener("pf:navigate", closeBrowser);
