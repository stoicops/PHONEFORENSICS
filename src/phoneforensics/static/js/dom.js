// Small DOM helpers with runtime checks, so the type checker can trust the elements exist.

import { html } from "./html.js";

/**
 * @template {Element} T
 * @param {string} selector
 * @param {new (...args: never[]) => T} type
 * @param {ParentNode} [root]
 * @returns {T}
 */
export function find(selector, type, root = document) {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing element: ${selector}`);
  return element;
}

/**
 * @template {Element} T
 * @param {string} selector
 * @param {new (...args: never[]) => T} type
 * @param {ParentNode} [root]
 * @returns {T | null}
 */
export function maybe(selector, type, root = document) {
  const element = root.querySelector(selector);
  return element instanceof type ? element : null;
}

/**
 * @template {Element} T
 * @param {string} selector
 * @param {new (...args: never[]) => T} type
 * @param {ParentNode} [root]
 * @returns {T[]}
 */
export function findAll(selector, type, root = document) {
  return [...root.querySelectorAll(selector)].filter(/** @returns {el is T} */ (el) => el instanceof type);
}

/** @param {string} name @param {string} [extraClass] */
export function icon(name, extraClass = "") {
  return html`<svg class="pf-icon ${extraClass}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

const TOAST_MS = 4000;

/** Announce a short message (polite live region). @param {string} message */
export function toast(message) {
  const region = find("#toast", HTMLElement);
  const item = document.createElement("div");
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), TOAST_MS);
}
