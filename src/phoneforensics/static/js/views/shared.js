// Building blocks used by more than one view.

import { FOOTER } from "../content.js";
import { icon } from "../dom.js";
import { html } from "../html.js";

/** @typedef {import("../content.js").Step} Step */

export const footer = () => html`<footer class="pf-footer">${FOOTER}</footer>`;

/** @param {readonly Step[]} steps */
export const stepList = (steps) =>
  html`<ol class="pf-steps">${steps.map(
    ([title, text]) =>
      html`<li class="pf-steps__item"><div><p class="pf-steps__title">${title}</p><p class="pf-steps__text">${text}</p></div></li>`,
  )}</ol>`;

/** @param {import("../html.js").Interpolation} content */
export const note = (content, iconName = "info") =>
  html`<div class="pf-note">${icon(iconName)}<div class="pf-m0">${content}</div></div>`;

/** Spinner ring used while something runs. */
export const ring = () =>
  html`<svg class="pf-scan__ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="pf-scan__track" cx="50" cy="50" r="42"/><circle class="pf-scan__fill" cx="50" cy="50" r="42" stroke-dasharray="70 264"/></svg>`;

/** @param {string} message */
export const emptyState = (message, iconName = "info") =>
  html`<div class="pf-empty">${icon(iconName)}<p>${message}</p></div>`;
