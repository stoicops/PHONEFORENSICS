// Typed client for the local PhoneForensics server.

/**
 * @typedef {{ count: number, updated: string | null }} IndicatorStatus
 * @typedef {{ version: string, mvt: string | null, python: string, platform: string,
 *   iocs: IndicatorStatus, cases_dir: string, home: string, support_url: string }} Status
 * @typedef {"scan" | "iocs" | "update"} JobKind
 * @typedef {{ id: string, kind: JobKind, title: string, status: "running" | "done" | "failed",
 *   started: number, finished: number | null, error: string | null, case_dir: string | null }} Job
 * @typedef {{ path: string, name: string, encrypted: boolean | null, model?: string | null,
 *   ios?: string | null, date?: string | null }} BackupInfo
 * @typedef {{ name: string, path: string, dir: boolean }} BrowseEntry
 * @typedef {{ path: string, parent: string | null, entries: BrowseEntry[], is_ios_backup?: boolean,
 *   ios_backup?: BackupInfo | null }} BrowseResult
 * @typedef {{ ioc?: Indicator } & Indicator} MatchedIndicator
 * @typedef {{ value?: string, type?: string, name?: string }} Indicator
 * @typedef {{ module: string, level?: string | null, message?: string | null, time?: string | null,
 *   record?: Record<string, unknown> & { matched_indicator?: MatchedIndicator | null } }} Finding
 * @typedef {{ verdict: "detected" | "clean", detections: Finding[], detection_count: number,
 *   modules: { name: string, records: number }[], timeline: Record<string, string>[],
 *   warnings: string[], files: string[], completed: boolean }} Summary
 * @typedef {"ios-backup" | "ios-fs" | "android-qf" | "android-bugreport" | "android-backup"} ScanType
 * @typedef {{ id: string, label: string, type: ScanType, source: string, created: string, demo?: boolean }} CaseMeta
 * @typedef {CaseMeta & { verdict: "detected" | "clean" | "failed" | "incomplete", detection_count: number }} CaseListItem
 * @typedef {CaseMeta & { summary: Summary, path: string }} CaseDetail
 * @typedef {{ current: string | null, latest: string | null, available: boolean }} Component
 * @typedef {{ app: Component & { url: string }, mvt: Component, method: "git" | "download", errors: string[] }} UpdateReport
 * @typedef {{ type: ScanType, path: string, password: string, label: string, fast: boolean, consent: boolean }} ScanRequest
 */

export class ApiError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const OFFLINE_MESSAGE = "PhoneForensics is not responding. Is its window still open?";

/**
 * @template T
 * @param {string} url
 * @param {{ method?: "GET" | "POST", body?: unknown }} [options]
 * @returns {Promise<T>}
 */
async function request(url, options = {}) {
  /** @type {Response} */
  let response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      // JSON content type on every request: the server refuses writes without it (CSRF protection).
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: options.body === undefined ? (options.method === "POST" ? "{}" : undefined) : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }
  /** @type {unknown} */
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return /** @type {T} */ (data);
}

export const api = {
  /** @returns {Promise<Status>} */ status: () => request("/api/status"),
  /** @returns {Promise<CaseListItem[]>} */ cases: () => request("/api/cases"),
  /** @param {string} id @returns {Promise<CaseDetail>} */
  case: (id) => request(`/api/cases/${encodeURIComponent(id)}`),
  /** @param {string} id @returns {Promise<{ok: boolean}>} */
  deleteCase: (id) => request(`/api/cases/${encodeURIComponent(id)}/delete`, { method: "POST" }),
  /** @param {string} id @returns {Promise<{ok: boolean}>} */
  openCaseFolder: (id) => request(`/api/cases/${encodeURIComponent(id)}/open`, { method: "POST" }),
  /** @param {string} id @param {string} name */
  caseFileUrl: (id, name) => `/api/cases/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`,
  /** @returns {Promise<BackupInfo[]>} */ iosBackups: () => request("/api/ios-backups"),
  /** @param {string} path @returns {Promise<BrowseResult>} */
  browse: (path) => request(`/api/browse?path=${encodeURIComponent(path)}`),
  /** @param {ScanRequest} body @returns {Promise<Job>} */
  startScan: (body) => request("/api/scan", { method: "POST", body }),
  /** @returns {Promise<Job>} */ updateIndicators: () => request("/api/iocs/update", { method: "POST" }),
  /** @param {string} id @returns {Promise<Job>} */ job: (id) => request(`/api/jobs/${encodeURIComponent(id)}`),
  /** @param {string} id @returns {Promise<{ok: boolean}>} */
  cancelJob: (id) => request(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  /** @param {string} id */ jobStreamUrl: (id) => `/api/jobs/${encodeURIComponent(id)}/stream`,
  /** @returns {Promise<UpdateReport>} */ checkUpdates: () => request("/api/updates"),
  /** @returns {Promise<Job>} */ applyUpdates: () => request("/api/updates/apply", { method: "POST" }),
  /** @returns {Promise<{ok: boolean}>} */ restart: () => request("/api/restart", { method: "POST" }),
};

/** Human message for anything thrown. @param {unknown} error */
export function errorMessage(error) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
