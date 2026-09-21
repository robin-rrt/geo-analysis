// Import the correlation study into the run store.
//
// The study (experiments/correlation/, 2026-09-18) already measured 10 pages
// end to end for $24.80: audits, and both a web and a closed probe arm over the
// same probes, all graded by one grader. Re-running that to populate the
// dashboard would pay twice for the same measurement.
//
// This is importable where the old `results/<slug>/` directories are not: the
// study's protocol is fully known and recorded in its pre-registration, so the
// imported run carries a real fingerprint rather than the "protocol unknown"
// that makes a point unjoinable to any trend.
//
// Usage: node scripts/import-correlation-study.mjs [--dry-run]

import fs from "node:fs";
import path from "node:path";
import { pageKey, assertUniqueKeys } from "../src/store/slug.js";
import { createManifest, writeManifest, runDir, protocolFingerprint } from "../src/store/run.js";
import { project } from "../src/store/project.js";

const STUDY = "experiments/correlation";
const ROOT = "results";
const DRY = process.argv.includes("--dry-run");

// From experiments/correlation/PREREGISTRATION.md — the protocol constants the
// study held fixed across every unit.
const PROTOCOL = {
  analystModel: "claude-opus-4-8",
  analystEffort: "high",
  probeModel: "claude-opus-4-8",
  probeEffort: "medium",
  graderModel: "claude-sonnet-5",
  mode: "web",
  batch: true,
};

// The study ran on this date; the imported run is dated honestly rather than now.
const RAN_AT = "2026-09-18T18:00:00.000Z";
const RUN_ID = "2026-09-18T18-00-00-000Z-study";

const units = JSON.parse(fs.readFileSync(path.join(STUDY, "units.json"), "utf8"));
assertUniqueKeys(units.map((u) => u.url));

const dest = runDir(ROOT, RUN_ID);
let pages = 0;
let probeFiles = 0;

for (const unit of units) {
  const key = pageKey(unit.url);
  const pageDir = path.join(dest, "pages", key);

  const auditSrc = path.join(STUDY, "audits", `${unit.slug}.md`);
  if (!fs.existsSync(auditSrc)) {
    console.error(`skipping ${unit.slug}: no audit`);
    continue;
  }

  if (!DRY) fs.mkdirSync(pageDir, { recursive: true });
  if (!DRY) fs.copyFileSync(auditSrc, path.join(pageDir, "audit.md"));
  pages++;

  // Both arms come across. readPage picks up every probe-results-*.json and
  // prefers the web arm for the headline, which is correct: closed mode
  // measures parametric recall, not retrieval.
  for (const mode of ["web", "closed"]) {
    const src = path.join(STUDY, "runs", `${unit.slug}-${mode}.json`);
    if (!fs.existsSync(src)) continue;
    if (!DRY) fs.copyFileSync(src, path.join(pageDir, `probe-results-${mode}.json`));
    probeFiles++;
  }
}

const manifest = {
  ...createManifest({
    runId: RUN_ID,
    target: { type: "watchlist", name: "correlation-study", productScope: null },
    stages: ["audit", "probes", "test"],
    protocol: PROTOCOL,
  }),
  startedAt: RAN_AT,
  endedAt: RAN_AT,
  status: "complete",
  counts: { pages, failed: 0 },
  cost: { measured: 24.8, currency: "USD" },
  protocolFingerprint: protocolFingerprint(PROTOCOL),
  note: "Imported from experiments/correlation — measured 2026-09-18, not re-run.",
};

if (!DRY) {
  writeManifest(ROOT, manifest);
  const summary = project(ROOT);
  console.log(`imported ${pages} pages, ${probeFiles} probe runs`);
  console.log(`projection: ${summary.pages} pages, ${summary.runs} runs, ${summary.points} trend points`);
} else {
  console.log(`[dry run] would import ${pages} pages, ${probeFiles} probe runs into ${dest}`);
}
