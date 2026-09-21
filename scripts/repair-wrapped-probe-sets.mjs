// One-off repair for probe sets written by the wrapper bug.
//
// `genProbes` returns `{ probes, page }`. The pipeline briefly wrote that
// wrapper whole instead of the inner probe set, producing a probes.json whose
// `probes` key holds an object rather than an array. `runProbes` rejects it
// with "no probes found", but only at the test stage — after generation has
// been paid for. One 43-page run failed on every page this way.
//
// On immutability: run snapshots are not rewritten lightly, and this is the
// narrow exception. The file is CORRUPT, not a record of a different
// measurement — the probes inside it are exactly what was generated and paid
// for. Unwrapping recovers them byte for byte; nothing measured changes.
//
// Idempotent. Run with --dry-run first.
//
//   node scripts/repair-wrapped-probe-sets.mjs [--dry-run]

import fs from "node:fs";
import path from "node:path";
import { RUNS_DIR } from "../src/store/run.js";

const ROOT = "results";
const DRY = process.argv.includes("--dry-run");

const runsDir = path.join(ROOT, RUNS_DIR);
if (!fs.existsSync(runsDir)) {
  console.error(`no runs at ${runsDir}`);
  process.exit(1);
}

let repaired = 0;
let alreadyFine = 0;
let unrecognised = 0;
let probes = 0;

for (const runId of fs.readdirSync(runsDir)) {
  const pagesDir = path.join(runsDir, runId, "pages");
  if (!fs.existsSync(pagesDir)) continue;

  for (const key of fs.readdirSync(pagesDir)) {
    const file = path.join(pagesDir, key, "probes.json");
    if (!fs.existsSync(file)) continue;

    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      unrecognised++;
      continue;
    }

    if (Array.isArray(doc.probes)) {
      alreadyFine++;
      continue;
    }

    // The wrapper shape: { probes: <probeSet>, page: {...} }
    if (doc.probes && Array.isArray(doc.probes.probes)) {
      const inner = doc.probes;
      probes += inner.probes.length;
      repaired++;
      if (!DRY) {
        const tmp = `${file}.repair.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(inner, null, 2) + "\n");
        fs.renameSync(tmp, file);
      }
      continue;
    }

    unrecognised++;
  }
}

const verb = DRY ? "would repair" : "repaired";
console.log(`${verb} ${repaired} probe set(s) holding ${probes} probes`);
console.log(`${alreadyFine} already valid, ${unrecognised} unrecognised (left untouched)`);
if (repaired && !DRY) {
  console.log("\nRe-run the target with --stages test to grade them; audit and");
  console.log("probe generation will be reused, so only the test stage costs anything.");
}
