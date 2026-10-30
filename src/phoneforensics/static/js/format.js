// Pure formatting helpers (no DOM), unit-tested in tests/js.

/** @param {string | null | undefined} iso */
export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "safari_history" / "SafariHistory" -> "Safari history" @param {string} name */
export function prettyName(name) {
  const spaced = name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** @param {number} count @param {string} singular @param {string} [plural] */
export function plural(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** @type {ReadonlyArray<readonly [RegExp, string]>} */
const AREAS = [
  [/sms|message|imessage/i, "text messages"],
  [/whatsapp/i, "WhatsApp"],
  [/safari|chrome|webkit|browser|firefox/i, "browsing history"],
  [/package|app|install/i, "installed apps"],
  [/process/i, "running processes"],
  [/calendar/i, "calendar"],
  [/datausage|netusage|network/i, "network use"],
  [/analytic|crash|shutdown|log|dumpsys|bugreport|getprop|settings/i, "system logs"],
  [/tcc|permission/i, "app permissions"],
  [/profile|configuration/i, "device profiles"],
  [/manifest|backup|files/i, "backup files"],
  [/sysdiag/i, "diagnostics"],
];

/** Plain-language name for the part of the phone an MVT module reads. @param {string} module */
export function areaOf(module) {
  const match = AREAS.find(([pattern]) => pattern.test(module));
  return match ? match[1] : "phone data";
}

/** Module name from an MVT log line such as "[mvt.ios.modules.mixed.sms] ...". @param {string} line */
export function moduleFromLogLine(line) {
  const match = line.match(/mvt\.\w+\.modules\.(?:\w+\.)*?(\w+)\]/);
  return match?.[1] ?? null;
}

/** @typedef {"done" | "current" | "todo"} StageState */

/**
 * Verb form for a stage label written in the imperative ("Load the lists").
 * @param {string} label
 * @param {StageState} state
 */
export function stageText(label, state) {
  if (state === "todo") return label;
  const forms = /** @type {const} */ ({
    Load: ["Loaded", "Loading"],
    Open: ["Opened", "Opening"],
    Download: ["Downloaded", "Downloading"],
    Check: ["Checked", "Checking"],
    Update: ["Updated", "Updating"],
  });
  const [verb = "", ...rest] = label.split(" ");
  const form = forms[/** @type {keyof typeof forms} */ (verb)];
  if (!form) return label;
  return [state === "done" ? form[0] : form[1], ...rest].join(" ");
}
