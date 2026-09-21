// Re-grade the answers a run already bought.
//
// The model's answers are the expensive part — $80 for the CRE run, of which
// grading was $3.19. When the grader changes, re-running the whole test stage
// would pay for the answers a second time to learn nothing new about them.
// This re-scores the stored answers instead.
//
// Output is a NEW run snapshot, not an edit of the old one. Runs are immutable,
// and this genuinely is a different measurement: same answers, different rubric.
// Its protocol carries the new grader prompt sha, so the fingerprint differs and
// the re-graded point will not be joined to a line drawn under the old rubric.
//
//   node scripts/regrade.mjs <runId> [--dry-run] [--concurrency 4]

import "../src/env.js";
import fs from "node:fs";
import path from "node:path";
import {
  buildGradeContent, summarizeResults, emptyUsage, addUsage,
  fidelityFromScores, graderPromptSha, EVAL_SCHEMA,
} from "../src/evaluate.js";
import { runClaude } from "../src/claude.js";
import { costOf } from "../src/usage.js";
import {
  newRunId, createManifest, writeManifest, runDir, readManifest, writeJsonAtomic, protocolFingerprint,
} from "../src/store/run.js";
import { project } from "../src/store/project.js";

const ROOT = "results";
const args = process.argv.slice(2);
const sourceRunId = args.find((a) => !a.startsWith("--"));
const DRY = args.includes("--dry-run");
const CONCURRENCY = Number(args[args.indexOf("--concurrency") + 1]) || 4;

if (!sourceRunId) {
  console.error("usage: node scripts/regrade.mjs <runId> [--dry-run]");
  process.exit(2);
}

const source = readManifest(ROOT, sourceRunId);
if (!source) {
  console.error(`no run ${sourceRunId}`);
  process.exit(1);
}

const pagesDir = path.join(runDir(ROOT, sourceRunId), "pages");
const units = [];
for (const key of fs.readdirSync(pagesDir)) {
  const dir = path.join(pagesDir, key);
  const probesFile = path.join(dir, "probes.json");
  if (!fs.existsSync(probesFile)) continue;
  const probeSet = JSON.parse(fs.readFileSync(probesFile, "utf8"));

  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("probe-results-") || !f.endsWith(".json")) continue;
    const run = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const gradable = (run.results ?? []).filter((r) => r.answer && r.stop !== "error");
    if (gradable.length) units.push({ key, dir, file: f, probeSet, run, gradable });
  }
}

const totalGrades = units.reduce((a, u) => a + u.gradable.length, 0);
console.log(`${units.length} probe run(s), ${totalGrades} stored answer(s) to re-grade`);
console.log(`grader prompt: ${graderPromptSha()}`);
if (DRY) {
  console.log("[dry run] nothing sent");
  process.exit(0);
}

const newId = newRunId();
const dest = runDir(ROOT, newId);
const protocol = {
  ...(source.protocol ?? {}),
  graderPromptSha: graderPromptSha(),
  regradeOf: sourceRunId,
};
writeManifest(ROOT, {
  ...createManifest({
    runId: newId,
    target: source.target,
    stages: ["regrade"],
    protocol,
  }),
  status: "running",
  counts: { expected: units.length, pages: 0, failed: 0 },
});

async function pool(items, limit, fn) {
  let i = 0;
  const out = [];
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = { ok: true, value: await fn(items[k]) };
        } catch (err) {
          out[k] = { ok: false, error: err?.message ?? String(err) };
        }
      }
    }),
  );
  return out;
}

let done = 0;
let spend = 0;

const results = await pool(units, CONCURRENCY, async (unit) => {
  const byId = new Map((unit.probeSet.probes ?? []).map((p) => [p.id, p]));
  const usage = emptyUsage();
  const regraded = [];

  for (const r of unit.run.results ?? []) {
    const probe = byId.get(r.probe_id);
    if (!probe || !r.answer || r.stop === "error") {
      regraded.push(r); // nothing to re-score; carry it through untouched
      continue;
    }
    const userContent = buildGradeContent({
      probe,
      answer: r.answer,
      citedUrls: r.retrieval?.cited_urls ?? [],
      retrieval: r.retrieval,
      sourceContent: unit.probeSet.source_content ?? "",
      cacheTtl: "1h",
    });
    const grade = await runClaude({
      promptFile: "probe-eval.md",
      userContent,
      model: unit.run.grader_model,
      effort: unit.run.grader_effort ?? "high",
      jsonSchema: EVAL_SCHEMA,
      cacheTtl: "1h",
      onUsage: (u) => addUsage(usage, u),
    });
    const { retrieval_note: note, ...rest } = grade;
    regraded.push({
      ...r,
      ...rest,
      fidelity: fidelityFromScores(grade.scores),
      retrieval: { ...r.retrieval, notes: note ?? "" },
    });
  }

  const summary = {
    ...unit.run,
    ...summarizeResults(regraded),
    results: regraded,
    grader_prompt_sha: graderPromptSha(),
    regrade_of: sourceRunId,
    usage: { ...unit.run.usage, grader: usage },
  };

  const outDir = path.join(dest, "pages", unit.key);
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(path.join(unit.dir, "probes.json"), path.join(outDir, "probes.json"));
  if (fs.existsSync(path.join(unit.dir, "audit.md"))) {
    fs.copyFileSync(path.join(unit.dir, "audit.md"), path.join(outDir, "audit.md"));
  }
  writeJsonAtomic(path.join(outDir, unit.file), summary);
  fs.writeFileSync(path.join(outDir, "stage-state.json"), JSON.stringify({ regraded: true }, null, 2));

  const cost = costOf(unit.run.grader_model, usage) ?? 0;
  spend += cost;
  done++;
  process.stderr.write(
    `  ${String(done).padStart(3)}/${units.length}  ${unit.key.slice(0, 44).padEnd(44)} ` +
      `${summary.avg_fidelity ?? "—"} (was ${unit.run.avg_fidelity ?? "—"})` +
      `${summary.unattributed_count ? `  ${summary.unattributed_count} wrong-subject` : ""}\n`,
  );
  return summary;
});

const ok = results.filter((r) => r.ok).map((r) => r.value);
const failed = results.filter((r) => !r.ok);

writeManifest(ROOT, {
  ...readManifest(ROOT, newId),
  status: failed.length ? "partial" : "complete",
  endedAt: new Date().toISOString(),
  counts: { expected: units.length, pages: ok.length, failed: failed.length },
  cost: { measured: Math.round(spend * 10000) / 10000, currency: "USD" },
  protocolFingerprint: protocolFingerprint(protocol),
});

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const before = mean(units.map((u) => u.run.avg_fidelity).filter(Number.isFinite));
const after = mean(ok.map((s) => s.avg_fidelity).filter(Number.isFinite));
const unattributed = ok.reduce((a, s) => a + (s.unattributed_count ?? 0), 0);

console.log(`\nre-graded ${ok.length} probe run(s), ${failed.length} failed`);
// Printing these was missing, so a run that failed 41/41 reported only a blank
// average and gave no way to see the cause.
for (const f of failed.slice(0, 5)) console.log(`  FAILED: ${f.error}`);
if (failed.length > 5) console.log(`  ... and ${failed.length - 5} more`);
console.log(`fidelity: ${before?.toFixed(1)} -> ${after?.toFixed(1)} (attributed answers only)`);
console.log(`answers that never identified the subject: ${unattributed} of ${totalGrades}`);
console.log(`grader spend: $${spend.toFixed(2)}`);
console.log(`new run: ${newId}`);

project(ROOT);
