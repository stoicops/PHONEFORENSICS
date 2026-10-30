// Safe HTML templating. Every interpolated value is escaped unless it is already SafeHtml,
// so data from MVT, file names or the user can never become markup.

export class SafeHtml {
  /** @param {string} value */
  constructor(value) {
    /** @readonly */
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** @param {string} text */
export function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/**
 * Mark a trusted, developer-written string as HTML. Never pass user or MVT data here.
 * @param {string} trusted
 */
export function raw(trusted) {
  return new SafeHtml(trusted);
}

/** @typedef {SafeHtml | string | number | boolean | null | undefined} Scalar */
/** @typedef {Scalar | ReadonlyArray<Scalar>} Interpolation */

/** @param {Scalar} value @returns {string} */
function renderScalar(value) {
  if (value instanceof SafeHtml) return value.value;
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(String(value));
}

/** @param {Interpolation} value @returns {string} */
function render(value) {
  if (Array.isArray(value)) return value.map(renderScalar).join("");
  return renderScalar(/** @type {Scalar} */ (value));
}

/**
 * Tagged template: html`<p>${userText}</p>` escapes userText.
 * @param {TemplateStringsArray} strings
 * @param {...Interpolation} values
 */
export function html(strings, ...values) {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    out += render(value) + (strings[i + 1] ?? "");
  });
  return new SafeHtml(out);
}

/**
 * @param {Element} element
 * @param {SafeHtml} content
 */
export function setHtml(element, content) {
  element.innerHTML = content.value;
}
