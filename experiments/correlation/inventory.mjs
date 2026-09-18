// Design inputs for the structure-vs-fidelity correlation study.
//
// Run before spending anything. Two numbers decide whether the study can
// conclude anything:
//
//   1. between-unit spread of structural scores — no spread, no correlation to find
//   2. within-unit SD of per-probe fidelity — this is measurement noise, and it
//      attenuates any correlation toward zero
//
// Attenuation is the part that is easy to get wrong. An observed correlation is
// roughly r_true x sqrt(reliability), where reliability of a k-probe mean is
// k*ICC / (1 + (k-1)*ICC). Spending the budget on more probes per unit buys
// reliability; spending it on more units buys degrees of freedom. This script
// estimates both so the split is chosen from data rather than by feel.

import fs from "node:fs";
import path from "node:path";

const RESULTS = "results";

export function probeRunFiles() {
  const out = [];
  for (const dir of [RESULTS, path.join(RESULTS, "products")]) {
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const sub = path.join(dir, e.name);
      for (const f of fs.readdirSync(sub)) {
        if (f.startsWith("probe-results-") && f.endsWith(".json")) out.push(path.join(sub, f));
      }
    }
  }
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Audit score for a unit directory, read from the report headline. */
export function auditScore(dir) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("audit") || !f.endsWith(".md")) continue;
    const m = fs.readFileSync(path.join(dir, f), "utf8").match(/^## GEO Score: (\d+(?:\.\d+)?)\/100/m);
    if (m) return Number(m[1]);
  }
  const rollup = path.join(dir, "rollup.json");
  if (fs.existsSync(rollup)) {
    const score = JSON.parse(fs.readFileSync(rollup, "utf8")).score;
    if (Number.isFinite(score)) return score;
  }
  return null;
}

function describe(file) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const rs = j.results ?? [];
  const fid = rs.map((r) => r.fidelity).filter(Number.isFinite);
  // "any citation at all" is a weaker and more robust signal than an exact-URL
  // hit: it separates total retrieval failure from partial success.
  const anyCitation = rs.filter((r) => (r.retrieval?.cited_urls ?? []).length > 0).length;
  return {
    file,
    unit: path.basename(path.dirname(file)),
    score: auditScore(path.dirname(file)),
    mode: j.mode,
    grader: j.grader_model ?? null,
    modelTested: j.model_tested ?? null,
    n: fid.length,
    meanFidelity: fid.length ? Number(mean(fid).toFixed(1)) : null,
    withinSd: fid.length > 1 ? Number(sd(fid).toFixed(1)) : null,
    hitRate: j.retrieval_hit_rate ?? null,
    anyCitation,
    total: rs.length,
    fidelities: fid,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = probeRunFiles().map(describe);
  console.log("=== existing probe runs ===");
  for (const r of runs) {
    console.log(`${r.unit}  [${r.mode}]  score=${r.score ?? "—"}`);
    console.log(
      `  grader=${r.grader ?? "?"} tested=${r.modelTested} n=${r.n} mean=${r.meanFidelity} withinSD=${r.withinSd}`,
    );
    console.log(`  hitRate=${r.hitRate} anyCitation=${r.anyCitation}/${r.total}`);
    console.log(`  fidelities: ${r.fidelities.join(", ")}`);
  }

  const sds = runs.map((r) => r.withinSd).filter(Number.isFinite);
  const pooledWithin = sds.length ? Math.sqrt(mean(sds.map((s) => s * s))) : null;
  const unitMeans = runs.map((r) => r.meanFidelity).filter(Number.isFinite);
  const betweenSd = sd(unitMeans);

  console.log("\n=== design inputs ===");
  console.log(`pooled within-unit SD (per probe): ${pooledWithin?.toFixed(1)}`);
  console.log(`observed between-unit SD of means: ${betweenSd?.toFixed(1)}`);

  if (pooledWithin && betweenSd) {
    // Between-unit variance is inflated by the noise in each unit's own mean;
    // subtract it out before computing ICC, or reliability comes out too high.
    const kAvg = mean(runs.filter((r) => r.n).map((r) => r.n));
    const trueBetweenVar = Math.max(0, betweenSd ** 2 - pooledWithin ** 2 / kAvg);
    const icc = trueBetweenVar / (trueBetweenVar + pooledWithin ** 2);
    console.log(`implied ICC (single probe): ${icc.toFixed(3)}  [from k≈${kAvg.toFixed(1)}]`);
    console.log("\nreliability and attenuation by probes-per-unit:");
    console.log("  k   reliability   observed r if true r=0.6");
    for (const k of [4, 6, 8, 10, 12]) {
      const rel = (k * icc) / (1 + (k - 1) * icc);
      console.log(
        `  ${String(k).padStart(2)}      ${rel.toFixed(3)}          ${(0.6 * Math.sqrt(rel)).toFixed(2)}`,
      );
    }
  }

  const scored = runs.filter((r) => Number.isFinite(r.score));
  console.log(`\nunits with BOTH a structural score and a probe run: ${scored.length}`);
}
