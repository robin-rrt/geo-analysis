// Cost projection, so nobody discovers the price after paying it.
//
// Every figure below is MEASURED, not guessed, and carries its provenance. They
// are collected here rather than scattered so that re-measuring updates one file.
//
// A projection is deliberately reported with a ±30% band. The inputs vary with
// page size, how much the model under test decides to search, and cache hits;
// a single confident number here would be false precision.

/** @typedef {{audit:number, genProbe:number, probeWeb:number, probeClosed:number}} UnitCosts */

export const UNIT_COSTS = Object.freeze({
  // One `score` audit of a page. Measured, recorded in plans/STATUS.md.
  audit: 0.1748,
  // Probe generation, per probe. $0.35 per 6-probe set, from the correlation study.
  genProbe: 0.0583,
  // Per probe, web mode, model-under-test + batched grader. Correlation study:
  // $16.42 across 10 units x 6 probes.
  probeWeb: 0.2737,
  // Per probe, closed mode. Same study: $1.82 across 60 probes.
  probeClosed: 0.0303,
});

export const COST_BAND = 0.3;
export const DEFAULT_CEILING = 10;

export const ALL_STAGES = ["resolve", "audit", "probes", "test", "rollup"];

/**
 * Project the cost of a run.
 *
 * Takes already-resolved counts — it must never trigger work to answer "what
 * would this cost". Resolving a target does fetch llms.txt and the sitemap, but
 * that is free and is how page count becomes known; no Anthropic call happens
 * here or anywhere in the estimate path.
 */
export function estimateRun({ pageCount, stages = ALL_STAGES, probesPerPage = 6, mode = "web" }) {
  const lines = [];
  const probeUnit = mode === "closed" ? UNIT_COSTS.probeClosed : UNIT_COSTS.probeWeb;
  const probeTotal = pageCount * probesPerPage;

  if (stages.includes("audit")) {
    lines.push({
      stage: "audit",
      detail: `${pageCount} page(s) x $${UNIT_COSTS.audit.toFixed(4)}`,
      cost: pageCount * UNIT_COSTS.audit,
    });
  }
  if (stages.includes("probes")) {
    lines.push({
      stage: "probes",
      detail: `${pageCount} set(s) x ${probesPerPage} x $${UNIT_COSTS.genProbe.toFixed(4)}`,
      cost: probeTotal * UNIT_COSTS.genProbe,
    });
  }
  if (stages.includes("test")) {
    lines.push({
      stage: "test",
      detail: `${probeTotal} probe(s) x $${probeUnit.toFixed(4)} (${mode})`,
      cost: probeTotal * probeUnit,
    });
  }
  // resolve and rollup are local computation over already-fetched content.

  const total = lines.reduce((a, l) => a + l.cost, 0);
  return { lines, total, low: total * (1 - COST_BAND), high: total * (1 + COST_BAND), band: COST_BAND };
}

export function formatEstimate(estimate, { target, stages, pageCount }) {
  const out = [];
  out.push(`  target     ${target} — ${pageCount} page(s)`);
  out.push(`  stages     ${stages.join(", ")}`);
  out.push("");
  for (const l of estimate.lines) {
    out.push(`  ${l.stage.padEnd(10)} ${l.detail.padEnd(38)} $${l.cost.toFixed(2).padStart(8)}`);
  }
  out.push(`  ${"-".repeat(58)}`);
  out.push(`  ${"projected".padEnd(49)} $${estimate.total.toFixed(2).padStart(8)}   ± ${Math.round(estimate.band * 100)}%`);
  out.push("");
  out.push("  Unit costs are measured, not guessed (src/run/estimate.js). Batch grading");
  out.push("  halves grader cost; the model under test is unaffected.");
  return out.join("\n");
}

/** Does this projection need explicit confirmation? */
export function needsConfirmation(total, ceiling = DEFAULT_CEILING) {
  return total > ceiling;
}

export function ceilingFromEnv(env = process.env) {
  const raw = env.GEO_COST_CEILING;
  if (raw === undefined) return DEFAULT_CEILING;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`GEO_COST_CEILING must be a non-negative number, got "${raw}"`);
  return n;
}
