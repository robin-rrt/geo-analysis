// Analysis for the correlation study. Written before outcomes were observed;
// see PREREGISTRATION.md. Run once, report what it says.
//
//   node experiments/correlation/analyze.mjs [--json out.json]

import fs from "node:fs";
import path from "node:path";
import { spearman, olsSlope, permutationP, bootstrapCI, signedRankP, mean, sd, detectableR, partialSpearman } from "./stats.mjs";

const DIR = "experiments/correlation";
const RUNS = path.join(DIR, "runs");

const f3 = (x) => (x === null || x === undefined || Number.isNaN(x) ? "—" : x.toFixed(3));
const f1 = (x) => (x === null || x === undefined || Number.isNaN(x) ? "—" : x.toFixed(1));

function loadRun(slug, mode) {
  const file = path.join(RUNS, `${slug}-${mode}.json`);
  if (!fs.existsSync(file)) return null;
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const byProbe = new Map();
  for (const r of j.results ?? []) {
    if (Number.isFinite(r.fidelity)) byProbe.set(r.probe_id, r.fidelity);
  }
  const rs = j.results ?? [];
  return {
    grader: j.grader_model,
    modelTested: j.model_tested,
    byProbe,
    fidelities: [...byProbe.values()],
    // "cited anything at all" — a weaker, more robust retrieval signal than an
    // exact-URL hit, and the one that distinguishes total failure from partial.
    anyCitation: rs.filter((r) => (r.retrieval?.cited_urls ?? []).length > 0).length,
    hitRate: j.retrieval_hit_rate,
    n: rs.length,
    // If the model never searches, the web arm is not testing retrieval at all —
    // it is closed mode with extra steps. This is a property of the protocol, so
    // it must be reported before any causal claim rests on the arm.
    searches: j.usage?.model_under_test?.web_search_requests ?? 0,
    searchDegraded: j.search_degraded_count ?? 0,
    searchFailed: j.live_search_failed_count ?? 0,
  };
}

/** Report one hypothesis: coefficient, permutation p, bootstrap CI, OLS slope. */
function testPair(label, xs, ys) {
  if (xs.length < 4) return { label, n: xs.length, note: "too few units" };
  const r = spearman(xs, ys);
  return {
    label,
    n: xs.length,
    spearman: r,
    p: permutationP(xs, ys, spearman),
    ci: bootstrapCI(xs, ys, spearman),
    slope: olsSlope(xs, ys),
    slopeCI: bootstrapCI(xs, ys, olsSlope),
  };
}

function printTest(t) {
  if (t.note) return console.log(`${t.label}: ${t.note} (n=${t.n})`);
  const ci = t.ci ? `[${f3(t.ci.lo)}, ${f3(t.ci.hi)}]` : "—";
  const sci = t.slopeCI ? `[${f3(t.slopeCI.lo)}, ${f3(t.slopeCI.hi)}]` : "—";
  console.log(`${t.label}`);
  console.log(`  Spearman r = ${f3(t.spearman)}   95% CI ${ci}   permutation p = ${f3(t.p)}`);
  console.log(`  OLS slope  = ${f3(t.slope)} per structural point   95% CI ${sci}`);
}

const units = JSON.parse(fs.readFileSync(path.join(DIR, "units.json"), "utf8"));

const rows = [];
for (const u of units) {
  const web = loadRun(u.slug, "web");
  const closed = loadRun(u.slug, "closed");
  if (!web || !closed) {
    console.error(`skipping ${u.slug}: missing ${!web ? "web" : "closed"} run`);
    continue;
  }
  // A run file exists from the moment answers are written, before its grading
  // batch returns. Including a half-finished unit would feed nulls straight into
  // the coefficients instead of failing loudly.
  if (!web.fidelities.length || !closed.fidelities.length) {
    console.error(
      `skipping ${u.slug}: ungraded (web ${web.fidelities.length}/${web.n}, closed ${closed.fidelities.length}/${closed.n})`,
    );
    continue;
  }
  // Pair on probe id: a probe graded in one arm but not the other would
  // otherwise shift the difference for reasons unrelated to retrieval.
  const shared = [...web.byProbe.keys()].filter((k) => closed.byProbe.has(k));
  const paired = shared.map((k) => ({ probe: k, web: web.byProbe.get(k), closed: closed.byProbe.get(k) }));
  rows.push({
    slug: u.slug,
    score: u.score,
    expectedProbes: Math.max(web.n, closed.n),
    refusals: { web: web.n - web.fidelities.length, closed: closed.n - closed.fidelities.length },
    webFidelity: web.fidelities.length ? mean(web.fidelities) : null,
    closedFidelity: closed.fidelities.length ? mean(closed.fidelities) : null,
    pairedWeb: paired.length ? mean(paired.map((p) => p.web)) : null,
    pairedClosed: paired.length ? mean(paired.map((p) => p.closed)) : null,
    lift: paired.length ? mean(paired.map((p) => p.web - p.closed)) : null,
    anyCitationRate: web.n ? web.anyCitation / web.n : null,
    hitRate: web.hitRate,
    searches: web.searches,
    searchesPerProbe: web.n ? web.searches / web.n : null,
    searchBroken: web.searchDegraded + web.searchFailed,
    pairedProbes: paired.length,
    probeDiffs: paired.map((p) => p.web - p.closed),
    graders: [web.grader, closed.grader],
  });
}

console.log("=== per-unit ===");
console.log("unit".padEnd(38), "score", " web", " clsd", " lift", " cite", "pairs");
for (const r of rows.sort((a, b) => a.score - b.score)) {
  console.log(
    r.slug.padEnd(38),
    String(r.score).padStart(5),
    f1(r.pairedWeb).padStart(5),
    f1(r.pairedClosed).padStart(5),
    f1(r.lift).padStart(5),
    (r.anyCitationRate === null ? "—" : r.anyCitationRate.toFixed(2)).padStart(5),
    String(r.pairedProbes).padStart(4),
  );
}

// Protocol check: one grader throughout, or the fidelity scales are not comparable.
const graders = new Set(rows.flatMap((r) => r.graders));
console.log(`\ngraders used: ${[...graders].join(", ")}${graders.size > 1 ? "  *** MIXED — scales not comparable ***" : ""}`);

const score = rows.map((r) => r.score);
console.log(`structural score: n=${rows.length} range ${Math.min(...score)}–${Math.max(...score)} SD ${f1(sd(score))}`);
console.log(`smallest |r| detectable at n=${rows.length}, alpha=.05: ${f3(detectableR(rows.length))}`);

// Validity check on the web arm itself. The causal story requires the model to
// actually search; if it does not, "web mode" is closed mode with extra steps and
// H3/H4 describe a path that was never exercised.
console.log("\n=== validity: did the web arm actually retrieve? ===");
console.log(`searches per probe: ${rows.map((r) => f1(r.searchesPerProbe)).join(", ")}`);
console.log(`total searches ${rows.reduce((a, r) => a + r.searches, 0)} across ${rows.reduce((a, r) => a + r.pairedProbes, 0)} paired probes`);
const broken = rows.filter((r) => r.searchBroken > 0);
console.log(broken.length ? `search degraded/failed on: ${broken.map((r) => r.slug).join(", ")}` : "no degraded or failed searches");
const noSearch = rows.filter((r) => r.searches === 0);
if (noSearch.length) console.log(`units that never searched: ${noSearch.map((r) => r.slug).join(", ")}`);

// Validity check. A probe the model refused in closed mode is dropped from the
// pair. If those drops are more common on low-scoring units, lift is computed on
// an easier subset there and the H3 coefficient is biased — so this is checked
// rather than assumed.
console.log("\n=== validity: probe attrition ===");
const expected = rows.map((r) => r.expectedProbes ?? 6);
const dropped = rows.map((r, i) => expected[i] - r.pairedProbes);
console.log(`probes dropped from pairing: ${dropped.reduce((a, b) => a + b, 0)} of ${expected.reduce((a, b) => a + b, 0)}`);
if (dropped.some((d) => d > 0)) {
  for (const [i, r] of rows.entries()) if (dropped[i]) console.log(`  ${r.slug}: -${dropped[i]}`);
  const attr = spearman(score, dropped);
  console.log(`attrition vs score: Spearman r = ${f3(attr)} (p = ${f3(permutationP(score, dropped, spearman, { iterations: 20_000 }))})`);
  console.log("  a strong negative r would mean low-scoring units lost their hardest probes — read H3 with that in mind");
} else {
  console.log("no attrition — every probe graded in both arms");
}

console.log("\n=== hypotheses ===");
const tests = {
  H1: testPair("H1  score -> web fidelity (naive)", score, rows.map((r) => r.pairedWeb)),
  H2: testPair("H2  score -> CLOSED fidelity (confound check; should be ~0)", score, rows.map((r) => r.pairedClosed)),
  H3: testPair("H3  score -> lift (web - closed)  [causal estimand]", score, rows.map((r) => r.lift)),
  H4: testPair("H4  score -> any-citation rate (mediator)", score, rows.map((r) => r.anyCitationRate)),
};
for (const t of Object.values(tests)) { printTest(t); console.log(); }

console.log("=== does web access help at all? (probe-level paired) ===");
const allDiffs = rows.flatMap((r) => r.probeDiffs);
const wil = signedRankP(allDiffs);
console.log(`paired probes: ${allDiffs.length}   mean lift ${f1(mean(allDiffs))} points   SD ${f1(sd(allDiffs))}`);
console.log(`Wilcoxon signed-rank p = ${f3(wil?.p)}`);
const citeRates = rows.map((r) => r.anyCitationRate).filter((x) => x !== null);
console.log(`any-citation rate across units: min ${f3(Math.min(...citeRates))} max ${f3(Math.max(...citeRates))} mean ${f3(mean(citeRates))}`);

// ---------------------------------------------------------------------------
// EXPLORATORY — not pre-registered. Reported to guide a future study, never as
// a finding. With 9 dimensions at n=10, P(at least one p<.05 by chance) = 1 -
// .95^9 = 37%, so a "hit" here is more likely noise than signal.
// ---------------------------------------------------------------------------
function dimensionScores(auditFile) {
  const out = {};
  for (const line of fs.readFileSync(auditFile, "utf8").split("\n")) {
    const m = line.match(/^\|\s*([A-Za-z][^|]*?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/);
    if (m && !/^\*\*/.test(m[1])) out[m[1].trim()] = Number(m[3]);
  }
  return out;
}

// Mechanism check. The causal chain is structure -> retrieval -> fidelity. The
// pre-registered tests all start at "structure". This asks whether the second
// link works at all: when the model actually searches, does it gain anything?
// If it does, a null on H3/H4 localises the failure to the FIRST link.
console.log("\n=== EXPLORATORY: does retrieval itself produce lift? (not pre-registered) ===");
const spp = rows.map((r) => r.searchesPerProbe);
const lifts = rows.map((r) => r.lift);
const mech = testPair("searches per probe -> lift", spp, lifts);
printTest(mech);
const citeMech = testPair("any-citation rate -> lift", rows.map((r) => r.anyCitationRate), lifts);
printTest(citeMech);
console.log("  caveat: any-citation counts URLs the model printed from memory (via=null), so it");
console.log("  overstates true retrieval; searches-per-probe is the cleaner mechanism measure.");

// The alternative explanation for the line above. `lift` is bounded by its own
// baseline — a unit already answered well cannot gain much — and the model
// plausibly searches less precisely when it already knows the topic. That alone
// would manufacture a searches->lift correlation with no causal role for search.
const closed = rows.map((r) => r.pairedClosed);
console.log("\n  -- ruling out the ceiling artefact --");
console.log(`  closed baseline -> lift:            r = ${f3(spearman(closed, lifts))}  (p = ${f3(permutationP(closed, lifts, spearman, { iterations: 20_000 }))})`);
console.log(`  closed baseline -> searches/probe:  r = ${f3(spearman(closed, spp))}  (p = ${f3(permutationP(closed, spp, spearman, { iterations: 20_000 }))})`);
const partial = partialSpearman(spp, lifts, closed);
console.log(`  searches -> lift, HOLDING baseline fixed: partial r = ${f3(partial)}`);
console.log("  if the partial collapses toward 0, the mechanism result is a ceiling artefact, not evidence.");

const dims = units.map((u) => dimensionScores(u.audit));
const names = [...new Set(dims.flatMap(Object.keys))];
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const aligned = units.map((u, i) => ({ dims: dims[i], row: bySlug.get(u.slug) })).filter((a) => a.row);

console.log("\n=== EXPLORATORY: per-dimension vs lift (not pre-registered; 37% chance of a spurious hit) ===");
const dimResults = [];
for (const name of names) {
  const xs = aligned.map((a) => a.dims[name]).filter((v) => Number.isFinite(v));
  if (xs.length !== aligned.length) continue;
  const ys = aligned.map((a) => a.row.lift);
  const r = spearman(xs, ys);
  if (r === null) { console.log(`  ${name.padEnd(46)} (no variance)`); continue; }
  const p = permutationP(xs, ys, spearman, { iterations: 20_000 });
  dimResults.push({ name, r, p });
  console.log(`  ${name.padEnd(46)} r=${f3(r).padStart(6)}  p=${f3(p)}`);
}

const jsonFlag = process.argv.indexOf("--json");
if (jsonFlag > -1) {
  const out = process.argv[jsonFlag + 1];
  fs.writeFileSync(out, JSON.stringify({ rows, tests, exploratoryDimensions: dimResults, lift: { n: allDiffs.length, mean: mean(allDiffs), sd: sd(allDiffs), wilcoxon: wil } }, null, 2));
  console.log(`\nwrote ${out}`);
}
