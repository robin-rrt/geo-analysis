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

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (n) => Math.round(n * 10) / 10;

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

  // Whether a probe SET exists is separate from whether it has been run. The UI
  // needs both to offer the right next action: generate, or grade what is
  // already generated and paid for.
  const set = readJson(path.join(dir, "probes.json"));
  const probeSet = Array.isArray(set?.probes) && set.probes.length
    ? { present: true, count: set.probes.length }
    : { present: false, count: 0 };

  return { key, audit, probeRuns, probeSet, dir };
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

  // Latest per ARTIFACT, not latest run wholesale.
  //
  // A `--stages audit` run produces no probe results. Taking its page state
  // whole would erase fidelity measured by an earlier run — which is exactly
  // what happened the first time this ran against real data. So the audit and
  // each probe mode are tracked separately, each remembering which run it came
  // from.
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
      const prev = latestByKey.get(p.key) ?? {
        key: p.key, audit: null, auditRun: null, probeRuns: new Map(),
        probeSet: { present: false, count: 0 }, health,
      };
      if (p.audit) {
        prev.audit = p.audit;
        prev.auditRun = m;
      }
      for (const r of p.probeRuns) {
        // Keyed by mode so a closed-mode run never displaces a web-mode one.
        prev.probeRuns.set(r.mode ?? "web", { run: r, manifest: m });
      }
      if (p.probeSet?.present) prev.probeSet = p.probeSet;
      if (p.probeRuns.length) prev.health = health;
      prev.manifest = prev.auditRun ?? m;
      latestByKey.set(p.key, prev);
    }
  }

  // Keys here are directory names and are unique by construction. The collision
  // risk lives where URLs are CONVERTED to keys — that check is in the pipeline,
  // before a run directory is created.

  const index = [];
  for (const [key, entry] of latestByKey) {
    const { audit, manifest, health } = entry;
    const probeRuns = [...entry.probeRuns.values()].map((v) => v.run);
    const primary = primaryProbeRun(probeRuns);
    const row = pick({
      key,
      url: audit?.url ?? null,
      title: audit?.title ?? null,
      score: audit?.score ?? null,
      band: bandFor(audit?.score),
      fidelity: primary?.avg_fidelity ?? null,
      graderModel: primary?.grader_model ?? null,
      probeCount: primary?.probe_count ?? 0,
      healthClean: health?.clean ?? true,
      runId: manifest?.runId ?? null,
      at: manifest?.endedAt ?? manifest?.startedAt ?? null,
    });
    index.push(row);

    // Detail carries everything the index deliberately excludes.
    writeJsonAtomic(path.join(out, "pages", `${key}.json`), {
      key,
      runId: manifest?.runId ?? null,
      audit,
      probeRuns,
      probeSet: entry.probeSet,
      // Graded is not the same as run: a probe run that errored on every probe
      // still writes a summary, and graded_count 0 means nothing was measured.
      tested: probeRuns.some((r) => (r.graded_count ?? 0) > 0),
      health,
      // Which run each artifact came from — a page can legitimately show an
      // audit from today and fidelity from last week.
      provenance: {
        audit: entry.auditRun?.runId ?? null,
        probes: Object.fromEntries([...entry.probeRuns].map(([mode, v]) => [mode, v.manifest.runId])),
      },
    });
  }

  index.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  // Per-target aggregation, including the nine rubric dimensions.
  //
  // Done here rather than in the browser because dimensions live in the page
  // detail files, deliberately kept out of the index. Averaging them client-side
  // would mean fetching every page to draw one section — re-creating the
  // scaling problem the index/detail split exists to prevent.
  const byTarget = new Map();
  for (const entry of latestByKey.values()) {
    const m = entry.auditRun ?? entry.manifest;
    const t = m?.target;
    if (!t?.name) continue;
    const id = `${t.type}:${t.name}`;
    if (!byTarget.has(id)) {
      byTarget.set(id, {
        name: t.name, type: t.type, runId: m.runId, status: m.status,
        at: m.endedAt ?? m.startedAt, pages: [], probeRuns: [],
      });
    }
    const g = byTarget.get(id);
    // Newest run wins the link, so "open run" lands on the latest.
    if (String(m.runId) > String(g.runId)) {
      Object.assign(g, { runId: m.runId, status: m.status, at: m.endedAt ?? m.startedAt });
    }
    if (entry.audit) g.pages.push(entry.audit);
    const primary = primaryProbeRun([...entry.probeRuns.values()].map((v) => v.run));
    if (primary) g.probeRuns.push(primary);
  }

  const products = [];
  for (const g of byTarget.values()) {
    const scores = g.pages.map((a) => a.score).filter(Number.isFinite);
    const fids = g.probeRuns.map((r) => r.avg_fidelity).filter(Number.isFinite);

    // Dimension means are over 0-10 scores, not weighted contributions: the
    // weight is reported alongside so a reader can see what a gap costs, but
    // folding it into the mean would make the number unreadable against the
    // rubric it came from.
    const dims = new Map();
    for (const a of g.pages) {
      for (const d of a.dimensions ?? []) {
        if (!dims.has(d.name)) dims.set(d.name, { name: d.name, weight: d.weight, scores: [] });
        if (Number.isFinite(d.score)) dims.get(d.name).scores.push(d.score);
      }
    }

    const bands = {};
    for (const a of g.pages) {
      const b = bandFor(a.score);
      if (b) bands[b] = (bands[b] ?? 0) + 1;
    }

    products.push({
      name: g.name,
      type: g.type,
      runId: g.runId,
      status: g.status,
      at: g.at,
      pages: { audited: scores.length, probed: fids.length, inScope: g.pages.length },
      score: scores.length
        ? { mean: round1(mean(scores)), min: Math.min(...scores), max: Math.max(...scores) }
        : null,
      // null, never 0 — a zero would read as "answers badly" when the truth is
      // "was never asked".
      fidelity: fids.length
        ? {
            mean: round1(mean(fids)),
            graders: [...new Set(g.probeRuns.map((r) => r.grader_model).filter(Boolean))],
          }
        : null,
      bands,
      dimensions: [...dims.values()]
        .filter((d) => d.scores.length)
        .map((d) => ({ name: d.name, weight: d.weight, mean: round1(mean(d.scores)), pages: d.scores.length })),
    });
  }
  products.sort((a, b) => (a.score?.mean ?? 999) - (b.score?.mean ?? 999));

  writeJsonAtomic(path.join(out, "products.json"), { generatedAt: now.toISOString(), products });

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
  // Per-run detail, mirroring the index/detail split: runs.json stays small and
  // the breakdown of what a run did is fetched only when someone opens it.
  for (const m of manifests) {
    const reportFile = path.join(runDir(root, m.runId), "report.json");
    const report = readJson(reportFile);
    writeJsonAtomic(path.join(out, "runs", `${m.runId}.json`), {
      ...m,
      // Runs from before the breakdown was recorded say so rather than
      // rendering as a run that did nothing.
      breakdown: report ?? null,
      ledger: readJson(path.join(runDir(root, m.runId), "pages.json")),
    });
  }

  writeJsonAtomic(path.join(out, "timeseries.json"), { generatedAt: now.toISOString(), points: series });

  return { pages: index.length, runs: manifests.length, points: series.length, products: products.length };
}

/** Average bytes per index row — the scaling property the split exists to hold. */
export function indexBytesPerRow(indexFile) {
  const data = readJson(indexFile);
  if (!data?.pages?.length) return 0;
  return Buffer.byteLength(JSON.stringify(data.pages)) / data.pages.length;
}
