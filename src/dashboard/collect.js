// Walks results/, joins every artifact belonging to one page, and computes the
// cross-page aggregates the dashboard reports.
//
// Reads nothing outside the results directory — no .env, no source files — so
// the rendered HTML can never carry a credential.

import fs from "node:fs";
import path from "node:path";
import { parseAudit } from "./parse-audit.js";
import { bodyUrls, retrievalHit } from "../retrieval.js";
import { probeSetId } from "../probe-set.js";

// Superseded artifacts kept on disk for reference; never rendered.
const SUPERSEDED = /-old\.(md|json)$/;

const round = (n, dp = 1) => (n === null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

function mean(values, dp = 1) {
  const nums = values.filter((v) => Number.isFinite(v));
  return nums.length ? round(nums.reduce((a, b) => a + b, 0) / nums.length, dp) : null;
}

function median(values, dp = 1) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return round(nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2, dp);
}

/** Share of probes that hit, over probes with a retrieval verdict (closed mode has none). */
function hitRateOf(probes) {
  const judged = probes.filter((p) => p.hit !== null);
  return judged.length ? round(judged.filter((p) => p.hit).length / judged.length, 2) : null;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/**
 * Older probe runs predate several harness counters. Absent must stay absent —
 * coercing a missing `searches_attempted` to 0 would invent a "model never
 * searched" finding that the data does not support.
 */
function normaliseHarness(harness = {}) {
  const known = (key) => (key in harness ? harness[key] : null);
  return {
    retries: known("retries") ?? 0,
    searchesAttempted: known("searches_attempted"),
    searchesSucceeded: known("searches_succeeded"),
    searchErrors: harness.search_errors ?? [],
    searchDegraded: known("search_degraded") ?? false,
    liveSearchFailed: known("live_search_failed"),
  };
}

/**
 * Retrieval verdict for one stored result. Runs recorded since retrieval moved
 * into code carry `via`. Older runs hold the grader's call, which judged
 * identical evidence both ways (a scheme-less mention was a hit in one run and
 * a miss in another), so it is recomputed with the rule the harness now applies
 * — but only against the probe set the run actually answered (same prompt).
 * Closed mode has no retrieval verdict at all.
 */
function normaliseRetrieval(r, mode, expected) {
  const stored = r.retrieval ?? {};
  const graderHit = Boolean(stored.hit_expected_source);
  if (mode === "closed") return { hit: null, via: null, recomputed: false, graderHit };
  if ("via" in stored) {
    return { hit: stored.hit_expected_source, via: stored.via, recomputed: false, graderHit };
  }
  if (!expected || expected.prompt !== r.prompt) {
    return { hit: graderHit, via: null, recomputed: false, graderHit };
  }
  const { hit, via } = retrievalHit({
    citedUrls: [...(stored.cited_urls ?? []), ...bodyUrls(r.answer ?? "")],
    answer: r.answer ?? "",
    expectedUrls: expected.urls,
  });
  return { hit, via, recomputed: true, graderHit };
}

function normaliseProbeRun(raw, file, expectedById = new Map()) {
  const probes = (raw.results ?? []).map((r) => ({
    id: r.probe_id,
    archetype: r.archetype,
    prompt: r.prompt,
    // Null for a refusal: nothing was graded.
    fidelity: r.fidelity ?? null,
    scores: r.scores,
    ...normaliseRetrieval(r, raw.mode, expectedById.get(r.probe_id)),
    stop: r.stop ?? null,
    citedUrls: r.retrieval?.cited_urls ?? [],
    retrievalNotes: r.retrieval?.notes || null,
    hallucinations: r.hallucinations ?? [],
    missingMustInclude: r.missing_must_include ?? [],
    unverifiable: r.unverifiable_from_source ?? [],
    verdict: r.verdict,
    answer: r.answer,
    harness: normaliseHarness(r.harness),
  }));

  // Hit rates are derived from the per-probe verdicts rather than read from the
  // run summary, so a recomputed legacy verdict is reflected in them.
  const judged = probes.filter((p) => p.hit !== null);
  const inconclusive = judged.filter(
    (p) => !p.hit && (p.harness.searchDegraded || p.harness.liveSearchFailed),
  ).length;
  const effectiveDenominator = judged.length - inconclusive;

  return {
    file: path.basename(file),
    model: raw.model_tested,
    graderModel: raw.grader_model,
    mode: raw.mode,
    runAt: raw.run_at,
    probeCount: raw.probe_count ?? probes.length,
    avgFidelity: raw.avg_fidelity ?? mean(probes.map((p) => p.fidelity)),
    avgScores: raw.avg_scores ?? null,
    hitRate: hitRateOf(probes),
    // The effective rate needs the search-health counters; older runs lack them.
    hitRateEffective:
      "retrieval_hit_rate_effective" in raw && effectiveDenominator > 0
        ? round(judged.filter((p) => p.hit).length / effectiveDenominator, 2)
        : null,
    hitCorrections: probes.filter((p) => p.recomputed && p.hit !== p.graderHit).length,
    // Absent in runs recorded before these counters existed.
    searchDegradedCount: raw.search_degraded_count ?? null,
    liveSearchFailedCount: raw.live_search_failed_count ?? null,
    inconclusiveMissCount: raw.inconclusive_miss_count ?? null,
    probes,
  };
}

/**
 * A page's current probe set and all of its probe runs, newest first. A run is
 * `current` when it answered this probe set — by its recorded probe_set_id, or,
 * for runs that predate the id, when every prompt matches. Stale runs stay
 * listed but are never compared against current ones.
 */
export function loadProbeRuns(dir) {
  const files = fs.readdirSync(dir).filter((f) => !SUPERSEDED.test(f));
  const probeSet = files.includes("probes.json") ? readJson(path.join(dir, "probes.json")) : null;
  const currentId = probeSet ? probeSetId(probeSet.probes) : null;

  // Expected source URLs per probe, keyed with the prompt so a run is only
  // re-judged against the probe set it actually answered.
  const expectedById = new Map(
    (probeSet?.probes ?? []).map((p) => [
      p.id,
      { prompt: p.prompt, urls: p.expected_source_urls ?? [] },
    ]),
  );

  const runs = files
    .filter((f) => f.startsWith("probe-results-") && f.endsWith(".json"))
    .map((f) => {
      const raw = readJson(path.join(dir, f));
      const run = normaliseProbeRun(raw, f, expectedById);
      run.current =
        probeSet !== null &&
        (raw.probe_set_id
          ? raw.probe_set_id === currentId
          : run.probes.every((p) => expectedById.get(p.id)?.prompt === p.prompt));
      return run;
    })
    .sort((a, b) => String(b.runAt).localeCompare(String(a.runAt)));

  return { probeSet, runs };
}

function collectPage(dir, slug) {
  const files = fs.readdirSync(dir).filter((f) => !SUPERSEDED.test(f));

  // A probe-informed re-score supersedes the plain audit for headline figures,
  // but both scores are kept so the re-score delta stays visible.
  const auditFiles = files.filter((f) => f.startsWith("audit") && f.endsWith(".md"));
  const preferred =
    auditFiles.find((f) => f === "audit-probe-informed.md") ??
    auditFiles.find((f) => f === "audit.md") ??
    auditFiles[0];
  if (!preferred) return null;

  const audit = parseAudit(fs.readFileSync(path.join(dir, preferred), "utf8"), `${slug}/${preferred}`);

  const variants = auditFiles.map((f) => {
    const parsed =
      f === preferred ? audit : parseAudit(fs.readFileSync(path.join(dir, f), "utf8"), `${slug}/${f}`);
    return { file: f, score: parsed.score, band: parsed.band, analyzedAt: parsed.analyzedAt };
  });

  const { runs: probeRuns } = loadProbeRuns(dir);

  return {
    slug,
    title: audit.title,
    url: audit.url,
    contentType: audit.contentType,
    analyzedAt: audit.analyzedAt,
    auditFile: preferred,
    auditVariants: variants,
    // Surfaced only when the same page was scored more than once.
    rescored:
      variants.length > 1
        ? { from: variants.find((v) => v.file === "audit.md")?.score ?? null, to: audit.score }
        : null,
    audit,
    probeRuns,
    // Newest run on the current probe set, preferring web mode: closed mode
    // measures parametric recall, not retrieval, so it must never become the
    // page's headline just by running last. Stale runs never headline at all.
    primaryRun:
      probeRuns.find((r) => r.current && r.mode === "web") ??
      probeRuns.find((r) => r.current) ??
      null,
  };
}

function aggregate(pages) {
  const probed = pages.filter((p) => p.primaryRun);
  const allProbes = probed.flatMap((p) => p.primaryRun.probes.map((x) => ({ ...x, slug: p.slug })));

  const hit = allProbes.filter((p) => p.hit);
  const miss = allProbes.filter((p) => p.hit === false);

  // Dimension means across pages — reveals which weakness is systemic.
  const byDimension = new Map();
  for (const page of pages) {
    for (const d of page.audit.dimensions) {
      if (!byDimension.has(d.name)) byDimension.set(d.name, { name: d.name, weight: d.weight, scores: [] });
      byDimension.get(d.name).scores.push(d.score);
    }
  }
  const dimensionMeans = [...byDimension.values()]
    .map(({ name, weight, scores }) => ({ name, weight, mean: mean(scores), n: scores.length }))
    .sort((a, b) => a.mean - b.mean);

  const hallucinations = allProbes.flatMap((p) => p.hallucinations);
  const countBy = (items, key) =>
    items.reduce((acc, item) => ({ ...acc, [item[key]]: (acc[item[key]] ?? 0) + 1 }), {});

  const archetypes = new Map();
  for (const p of allProbes) {
    if (!archetypes.has(p.archetype)) archetypes.set(p.archetype, []);
    archetypes.get(p.archetype).push(p);
  }
  const byArchetype = [...archetypes.entries()]
    .map(([archetype, ps]) => ({
      archetype,
      n: ps.length,
      avgFidelity: mean(ps.map((p) => p.fidelity)),
      hitRate: hitRateOf(ps),
    }))
    .sort((a, b) => a.avgFidelity - b.avgFidelity);

  // Funnel steps are only meaningful for runs that recorded the counters.
  const withCounters = allProbes.filter((p) => Number.isFinite(p.harness.searchesAttempted));
  const hitCorrections = probed.reduce((n, p) => n + p.primaryRun.hitCorrections, 0);
  const recommendations = pages.flatMap((p) =>
    p.audit.recommendations.map((r) => ({ ...r, slug: p.slug, pageTitle: p.title })),
  );

  return {
    pageCount: pages.length,
    probedPageCount: probed.length,
    probeCount: allProbes.length,
    medianScore: median(pages.map((p) => p.audit.score)),
    meanScore: mean(pages.map((p) => p.audit.score)),
    medianFidelity: median(probed.map((p) => p.primaryRun.avgFidelity)),
    hitRate: hitRateOf(allProbes),
    fidelityByRetrieval: {
      hit: { n: hit.length, avgFidelity: mean(hit.map((p) => p.fidelity)) },
      miss: { n: miss.length, avgFidelity: mean(miss.map((p) => p.fidelity)) },
      delta: round((mean(hit.map((p) => p.fidelity)) ?? 0) - (mean(miss.map((p) => p.fidelity)) ?? 0)),
    },
    dimensionMeans,
    hallucinations: {
      total: hallucinations.length,
      probesAffected: allProbes.filter((p) => p.hallucinations.length).length,
      byType: countBy(hallucinations, "type"),
      bySeverity: countBy(hallucinations, "severity"),
      highSeverity: hallucinations.filter((h) => h.severity === "high").length,
    },
    byArchetype,
    funnel: withCounters.length
      ? {
          n: withCounters.length,
          searched: withCounters.filter((p) => p.harness.searchesAttempted > 0).length,
          gotResults: withCounters.filter((p) => p.harness.searchesSucceeded > 0).length,
          citedSource: withCounters.filter((p) => p.hit).length,
          accurate: withCounters.filter((p) => p.fidelity >= 70).length,
        }
      : null,
    recommendationsByPriority: {
      p1: recommendations.filter((r) => r.priority === 1).length,
      p2: recommendations.filter((r) => r.priority === 2).length,
      p3: recommendations.filter((r) => r.priority === 3).length,
    },
    // Rendered verbatim so a reader always sees the denominator behind a stat.
    coverageNotes: [
      `${probed.length} of ${pages.length} audited pages have a probe run.`,
      `${allProbes.length} probes total — averages are small-sample; n is shown beside each.`,
      ...(withCounters.length < allProbes.length
        ? [
            `${allProbes.length - withCounters.length} probe(s) predate the search-health counters; ` +
              `they are excluded from the retrieval funnel rather than counted as zero.`,
          ]
        : []),
      ...(hitCorrections
        ? [
            `${hitCorrections} retrieval verdict(s) from older runs were recomputed with the ` +
              `harness's URL rule and differ from the grader's original call.`,
          ]
        : []),
      ...(pages.some((p) => p.rescored)
        ? ["At least one page was scored more than once; see Methodology for run-to-run variance."]
        : []),
    ],
  };
}

/** Build the full dashboard dataset from a results directory. */
export function collect(resultsDir) {
  if (!fs.existsSync(resultsDir)) {
    throw new Error(`results directory not found: ${resultsDir}`);
  }

  const pages = fs
    .readdirSync(resultsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => collectPage(path.join(resultsDir, e.name), e.name))
    .filter(Boolean)
    .sort((a, b) => a.audit.score - b.audit.score);

  if (!pages.length) throw new Error(`no audit reports found under ${resultsDir}`);

  return { generatedAt: new Date().toISOString(), pages, aggregates: aggregate(pages) };
}
