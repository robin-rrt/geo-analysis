// Project immutable runs into what a browser can load.
//
// `runs/` is the source of truth; everything written here is derived and can be
// deleted and rebuilt. The split exists because the old single-blob model does
// not scale: `dashboard-data.json` is 272KB for 4 pages — 14.7% audit prose,
// 41.8% probe runs, and 41.8% pure duplication where `primaryRun` repeated
// `probeRuns[0]` byte for byte.
//
// The index therefore carries an explicit ALLOWLIST of small fields. Anything
// not on the list — audit prose, probe payloads, model answers — lives in the
// per-page detail file and is fetched only when that page is opened. An
// allowlist rather than a denylist so the index cannot silently regain bulk
// when a new field appears upstream.

import fs from "node:fs";
import path from "node:path";
import { parseAudit } from "../dashboard/parse-audit.js";
import { pageKey } from "./slug.js";
import { listRuns, readJson, writeJsonAtomic, runDir, DASHBOARD_DIR, runHealth } from "./run.js";
import { buildPoint, appendPoint } from "./timeseries.js";

/** Everything the index may contain. Adding a field here is a deliberate act. */
export const INDEX_FIELDS = Object.freeze([
  "key",
  "url",
  "title",
  "score",
  "band",
  "fidelity",
  "graderModel",
  "probeCount",
  "healthClean",
  "runId",
  "at",
]);

function pick(row) {
  const out = {};
  for (const f of INDEX_FIELDS) if (row[f] !== undefined) out[f] = row[f];
  return out;
}

const BANDS = [
  [85, "Exemplary"],
  [70, "Strong"],
  [55, "Good"],
  [40, "Developing"],
  [0, "Poor"],
];

export const bandFor = (score) =>
  score === null || score === undefined ? null : BANDS.find(([min]) => score >= min)[1];

/** Read one page's artifacts out of a run snapshot. */
function readPage(root, runId, key) {
  const dir = path.join(runDir(root, runId), "pages", key);
  if (!fs.existsSync(dir)) return null;

  const auditFile = path.join(dir, "audit.md");
  let audit = null;
  if (fs.existsSync(auditFile)) {
    try {
      audit = parseAudit(fs.readFileSync(auditFile, "utf8"), auditFile);
    } catch {
      audit = null; // an unparseable audit is reported as absent, not fatal
    }
  }

  const probeRuns = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("probe-results-") && f.endsWith(".json"))
    .map((f) => readJson(path.join(dir, f)))
    .filter(Boolean);

  return { key, audit, probeRuns, dir };
}

/** Pages present in a run snapshot. */
function pagesOf(root, runId) {
  const dir = path.join(runDir(root, runId), "pages");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readPage(root, runId, e.name))
    .filter(Boolean);
}

/**
 * Headline fidelity for a page.
 *
 * Web mode wins over closed: closed measures parametric recall, not retrieval,
 * so it must never become the headline just by having run last.
 */
function primaryProbeRun(probeRuns) {
  return probeRuns.find((r) => r.mode === "web") ?? probeRuns[0] ?? null;
}

/**
 * Rebuild `dashboard/` from `runs/`.
 *
 * Idempotent and total: it reads only run snapshots, so deleting the whole
 * directory and calling this reproduces it.
 */
export function project(root, { now = new Date() } = {}) {
  const manifests = listRuns(root);
  const out = path.join(root, DASHBOARD_DIR);

  // Latest complete-or-partial run wins per page; a page is shown from the most
  // recent run that actually produced it.
  const latestByKey = new Map();
  let series = [];

  for (const m of [...manifests].reverse()) {
    const pages = pagesOf(root, m.runId);
    const health = runHealth(pages.flatMap((p) => p.probeRuns));

    const scores = pages.map((p) => p.audit?.score).filter((s) => Number.isFinite(s));
    const fidelities = pages
      .map((p) => primaryProbeRun(p.probeRuns)?.avg_fidelity)
      .filter((f) => Number.isFinite(f));

    series = appendPoint(
      series,
      buildPoint({
        manifest: m,
        score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        fidelity: fidelities.length ? fidelities.reduce((a, b) => a + b, 0) / fidelities.length : null,
        health,
        coverage: { measured: pages.length, ofTarget: m.counts?.pages ?? pages.length },
      }),
    );

    for (const p of pages) {
      latestByKey.set(p.key, { page: p, manifest: m, health });
    }
  }

  // Keys here are directory names and are unique by construction. The collision
  // risk lives where URLs are CONVERTED to keys — that check is in the pipeline,
  // before a run directory is created.

  const index = [];
  for (const [key, { page, manifest, health }] of latestByKey) {
    const primary = primaryProbeRun(page.probeRuns);
    const row = pick({
      key,
      url: page.audit?.url ?? null,
      title: page.audit?.title ?? null,
      score: page.audit?.score ?? null,
      band: bandFor(page.audit?.score),
      fidelity: primary?.avg_fidelity ?? null,
      graderModel: primary?.grader_model ?? null,
      probeCount: primary?.probe_count ?? 0,
      healthClean: health.clean,
      runId: manifest.runId,
      at: manifest.endedAt ?? manifest.startedAt,
    });
    index.push(row);

    // Detail carries everything the index deliberately excludes.
    writeJsonAtomic(path.join(out, "pages", `${key}.json`), {
      key,
      runId: manifest.runId,
      audit: page.audit,
      probeRuns: page.probeRuns,
      health,
    });
  }

  index.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  writeJsonAtomic(path.join(out, "index.json"), { generatedAt: now.toISOString(), pages: index });
  writeJsonAtomic(path.join(out, "runs.json"), {
    generatedAt: now.toISOString(),
    runs: manifests.map((m) => ({
      runId: m.runId,
      target: m.target,
      status: m.status,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      counts: m.counts,
      cost: m.cost,
      graderModel: m.protocol?.graderModel ?? null,
    })),
  });
  writeJsonAtomic(path.join(out, "timeseries.json"), { generatedAt: now.toISOString(), points: series });

  return { pages: index.length, runs: manifests.length, points: series.length };
}

/** Average bytes per index row — the scaling property the split exists to hold. */
export function indexBytesPerRow(indexFile) {
  const data = readJson(indexFile);
  if (!data?.pages?.length) return 0;
  return Buffer.byteLength(JSON.stringify(data.pages)) / data.pages.length;
}
