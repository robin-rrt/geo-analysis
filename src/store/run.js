// Immutable run snapshots.
//
// The defect this replaces: every run overwrote `results/<slug>/audit.md` in
// place. Confirmed the hard way — a single verification run of `geo-audit run`
// replaced a committed audit. With nothing retained, "are the docs improving?"
// is unanswerable, which is the question the whole product exists to answer.
//
// A run directory is written once and never modified. `dashboard/` is a pure
// projection of `runs/` and can be deleted and rebuilt at any time.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const RUNS_DIR = "runs";
export const DASHBOARD_DIR = "dashboard";

/** Terminal states a run can reach, and what each means for a trend line. */
export const RUN_STATUS = Object.freeze({
  queued: { terminal: false, postsTrend: false },
  running: { terminal: false, postsTrend: false },
  complete: { terminal: true, postsTrend: true },
  // Some pages failed. Recorded, browsable, but it must NOT post a trend point:
  // an average over the pages that happened to succeed is an average over a
  // self-narrowed denominator.
  partial: { terminal: true, postsTrend: false },
  cancelled: { terminal: true, postsTrend: false },
  interrupted: { terminal: true, postsTrend: false },
});

export const STATUSES = Object.keys(RUN_STATUS);

const LEGAL_TRANSITIONS = {
  queued: ["running", "cancelled"],
  running: ["complete", "partial", "cancelled", "interrupted"],
  complete: [],
  partial: [],
  cancelled: [],
  interrupted: ["running"], // a reconciled run may be resumed
};

export function canTransition(from, to) {
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`illegal run status transition ${from} -> ${to}`);
  }
}

/** Sortable, unique run id: ISO instant plus a short random suffix. */
export function newRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
  return `${stamp}-${crypto.randomBytes(2).toString("hex")}`;
}

export const runDir = (root, runId) => path.join(root, RUNS_DIR, runId);

/** Atomic write — a crash mid-write must not leave a half-parsed artifact. */
export function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Protocol fingerprint.
 *
 * Comparing fidelity across runs is invalid without this: Sonnet grades ~12
 * points harsher than Opus (measured, mean signed -12.1), so a trend line that
 * spans a grader change shows an improvement that is purely a model swap.
 */
export function protocolFingerprint(protocol = {}) {
  const parts = [
    protocol.graderModel ?? "unknown",
    protocol.probeModel ?? "unknown",
    protocol.probeEffort ?? "unknown",
    protocol.mode ?? "unknown",
  ];
  return parts.join("|");
}

/**
 * Run health, distinct from protocol.
 *
 * `search_degraded_count` and `live_search_failed_count` already exist and
 * already mean a run's fidelity is inconclusive. Fingerprinting the protocol
 * while ignoring these lets a degraded run join a trend as though it were clean.
 */
export function runHealth(probeRuns = []) {
  let degraded = 0;
  let failed = 0;
  for (const r of probeRuns) {
    degraded += r.search_degraded_count ?? 0;
    failed += r.live_search_failed_count ?? 0;
  }
  return { degraded, failed, clean: degraded === 0 && failed === 0 };
}

export function createManifest({ runId, target, stages, protocol, status = "queued" }) {
  if (!STATUSES.includes(status)) throw new Error(`unknown run status "${status}"`);
  return {
    runId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    target,
    stages,
    protocol,
    protocolFingerprint: protocolFingerprint(protocol),
    status,
    counts: { pages: 0, failed: 0 },
    cost: { measured: 0, currency: "USD" },
  };
}

export function writeManifest(root, manifest) {
  writeJsonAtomic(path.join(runDir(root, manifest.runId), "manifest.json"), manifest);
  return manifest;
}

export function readManifest(root, runId) {
  return readJson(path.join(runDir(root, runId), "manifest.json"));
}

/** Every run on disk, newest first. */
export function listRuns(root) {
  const dir = path.join(root, RUNS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readManifest(root, e.name))
    .filter(Boolean)
    .sort((a, b) => String(b.runId).localeCompare(String(a.runId)));
}

/**
 * Reconcile runs left mid-flight by a dead process.
 *
 * Marked `interrupted`, never auto-resumed: resuming without a human deciding
 * risks paying twice for work that may already have been committed upstream.
 */
export function reconcileInterrupted(root, now = new Date()) {
  const fixed = [];
  for (const m of listRuns(root)) {
    if (m.status === "running" || m.status === "queued") {
      const next = { ...m, status: "interrupted", endedAt: now.toISOString() };
      writeManifest(root, next);
      fixed.push(next.runId);
    }
  }
  return fixed;
}
