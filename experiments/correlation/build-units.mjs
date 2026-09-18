// Pick the study units from the audited candidates.
//
// Selection is on the PREDICTOR (structural score) only — no fidelity exists yet.
// Units are spread evenly across the sorted score range rather than taken from
// the extremes: extremes would maximise r-inflation, even spacing keeps the
// middle of the range populated so the slope is estimated across the whole span.
//
// Stated in the pre-registration and repeated here because it governs reading
// the result: selecting on x inflates Spearman r but leaves the OLS slope
// unbiased, so the slope is the primary effect size.

import fs from "node:fs";
import path from "node:path";
import { slugOf } from "./run-stage.mjs";

const DIR = "experiments/correlation";
const AUDITS = path.join(DIR, "audits");
const TARGET = 10;

function scoreOf(file) {
  const m = fs.readFileSync(file, "utf8").match(/^## GEO Score: (\d+(?:\.\d+)?)\/100/m);
  return m ? Number(m[1]) : null;
}

const urls = fs.readFileSync(path.join(DIR, "candidates.txt"), "utf8").trim().split("\n").filter(Boolean);

const audited = [];
for (const url of urls) {
  const slug = slugOf(url);
  const file = path.join(AUDITS, `${slug}.md`);
  if (!fs.existsSync(file)) { console.error(`no audit: ${slug}`); continue; }
  const score = scoreOf(file);
  if (score === null) { console.error(`no score parsed: ${slug}`); continue; }
  audited.push({ url, slug, score, audit: file });
}

audited.sort((a, b) => a.score - b.score);
console.error(`audited ${audited.length}: scores ${audited.map((a) => a.score).join(", ")}`);

const k = Math.min(TARGET, audited.length);
const picked = [];
const seen = new Set();
for (let i = 0; i < k; i++) {
  let idx = Math.round((i * (audited.length - 1)) / (k - 1));
  while (seen.has(idx) && idx < audited.length - 1) idx++;
  while (seen.has(idx) && idx > 0) idx--;
  if (seen.has(idx)) continue;
  seen.add(idx);
  picked.push(audited[idx]);
}

const units = picked.map((u) => ({ ...u, probes: path.join(DIR, "probes", `${u.slug}.json`) }));
fs.mkdirSync(path.join(DIR, "probes"), { recursive: true });
fs.writeFileSync(path.join(DIR, "units.json"), JSON.stringify(units, null, 2));

console.error(`\nselected ${units.length} units:`);
for (const u of units) console.error(`  ${String(u.score).padStart(5)}  ${u.slug}`);
const scores = units.map((u) => u.score);
console.error(`range ${Math.min(...scores)}–${Math.max(...scores)}`);
