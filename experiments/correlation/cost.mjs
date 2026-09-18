// What the study actually cost.
//
// Probe runs record usage, so their cost is computed, not estimated. Audits and
// gen-probes record none, so those are priced from the README's measured page-audit
// figure and marked as estimates — labelled rather than silently folded into a
// total that would look more precise than it is.

import fs from "node:fs";
import path from "node:path";
import { costOf } from "../../src/usage.js";

const DIR = "experiments/correlation";
const RUNS = path.join(DIR, "runs");
const AUDIT_EST = 0.17;   // measured, README
const GENPROBES_EST = 0.35; // same analyst model/effort, smaller output

let measured = 0;
const byArm = { web: 0, closed: 0 };
const rows = [];

if (fs.existsSync(RUNS)) {
  for (const f of fs.readdirSync(RUNS).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(RUNS, f), "utf8"));
    const mut = costOf(j.model_tested, j.usage?.model_under_test ?? {}) ?? 0;
    const grader = costOf(j.grader_model, j.usage?.grader ?? {}) ?? 0;
    const total = mut + grader;
    measured += total;
    const arm = f.endsWith("-web.json") ? "web" : "closed";
    byArm[arm] += total;
    rows.push({ file: f, arm, mut, grader, total, batched: j.usage?.grader?.service_tier === "batch" });
  }
}

rows.sort((a, b) => b.total - a.total);
console.log("=== probe runs (measured) ===");
console.log("run".padEnd(50), "model".padStart(8), "grader".padStart(8), "total".padStart(8), " batched");
for (const r of rows) {
  console.log(
    r.file.padEnd(50),
    r.mut.toFixed(4).padStart(8),
    r.grader.toFixed(4).padStart(8),
    r.total.toFixed(4).padStart(8),
    r.batched ? "  yes" : "   no",
  );
}

const nAudits = fs.existsSync(path.join(DIR, "audits"))
  ? fs.readdirSync(path.join(DIR, "audits")).filter((f) => f.endsWith(".md")).length : 0;
const nProbeSets = fs.existsSync(path.join(DIR, "probes"))
  ? fs.readdirSync(path.join(DIR, "probes")).filter((f) => f.endsWith(".json")).length : 0;

console.log(`\nweb arm    $${byArm.web.toFixed(2)}`);
console.log(`closed arm $${byArm.closed.toFixed(2)}`);
console.log(`probe runs, measured:      $${measured.toFixed(2)}  (${rows.length} runs)`);
console.log(`${nAudits} audits, estimated:        $${(nAudits * AUDIT_EST).toFixed(2)}`);
console.log(`${nProbeSets} probe sets, estimated:     $${(nProbeSets * GENPROBES_EST).toFixed(2)}`);
console.log(`TOTAL (mixed measured/est): $${(measured + nAudits * AUDIT_EST + nProbeSets * GENPROBES_EST).toFixed(2)}`);
