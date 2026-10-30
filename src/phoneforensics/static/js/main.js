// Entry point: hash router with lazily-loaded views, shared status, and global error handling.

import { api, errorMessage } from "./api.js";
import { find, findAll, icon, toast } from "./dom.js";
import { html, setHtml } from "./html.js";

/** @typedef {import("./api.js").Status} Status */
/**
 * @typedef {{ status: Status, refreshStatus: () => Promise<Status> }} AppContext
 * @typedef {(view: HTMLElement, arg: string, ctx: AppContext) => Promise<(() => void) | void>} RenderView
 */

/** @type {Record<string, { nav: string, load: () => Promise<{ render: RenderView }> }>} */
const ROUTES = {
  "": { nav: "home", load: () => import("./views/home.js") },
  scan: { nav: "scan", load: () => import("./views/wizard.js") },
  job: { nav: "scan", load: () => import("./views/job.js") },
  cases: { nav: "cases", load: () => import("./views/cases.js") },
  case: { nav: "cases", load: () => import("./views/case.js") },
  help: { nav: "help", load: () => import("./views/guide.js") },
};

const view = find("#view", HTMLElement);
/** @type {(() => void) | undefined} */
let cleanup;
let navigation = 0;

/** @type {AppContext} */
const ctx = {
  status: /** @type {Status} */ ({}),
  async refreshStatus() {
    ctx.status = await api.status();
    const support = find("#supportLink", HTMLAnchorElement);
    support.hidden = !ctx.status.support_url;
    if (ctx.status.support_url) support.href = ctx.status.support_url;
    return ctx.status;
  },
};

async function route() {
  const current = ++navigation;
  cleanup?.();
  cleanup = undefined;
  document.dispatchEvent(new CustomEvent("pf:navigate"));
  const [name = "", arg = ""] = location.hash.replace(/^#\/?/, "").split("/");
  const entry = ROUTES[name] ?? ROUTES[""];
  if (!entry) return;
  for (const link of findAll("[data-nav]", HTMLAnchorElement)) {
    if (link.dataset.nav === entry.nav) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  view.setAttribute("aria-busy", "true");
  try {
    const module = await entry.load();
    if (current !== navigation) return; // the user moved on while this loaded
    setHtml(view, html``);
    cleanup = (await module.render(view, decodeURIComponent(arg), ctx)) ?? undefined;
  } catch (error) {
    if (current !== navigation) return;
    showError(view, errorMessage(error));
  } finally {
    view.removeAttribute("aria-busy");
  }
  // Move focus to the new screen for keyboard and screen-reader users, but not on first load,
  // where focus should start at the top of the page (skip link, then navigation).
  if (current > 1) view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/** @param {HTMLElement} target @param {string} message */
export function showError(target, message) {
  setHtml(
    target,
    html`<div class="pf-note" role="alert">${icon("info")}<div class="pf-stack-sm">
      <p class="pf-m0">${message}</p>
      <div class="pf-row"><button class="pf-btn" type="button" data-retry>Try again</button></div></div></div>`,
  );
  target.querySelector("[data-retry]")?.addEventListener("click", () => void route());
}

window.addEventListener("hashchange", () => void route());
window.addEventListener("error", (event) => {
  console.error(event.error ?? event.message);
  toast("Something went wrong on this page. Please try again.");
});
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  toast(errorMessage(event.reason));
});

ctx
  .refreshStatus()
  .then(route)
  .catch((error) => showError(view, errorMessage(error)));
