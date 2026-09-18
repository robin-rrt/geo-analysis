// Capped-concurrency runner for one stage of the correlation study.
//
//   node experiments/correlation/run-stage.mjs audit  [concurrency]
//   node experiments/correlation/run-stage.mjs probes [concurrency]
//   node experiments/correlation/run-stage.mjs web|closed [concurrency]
//
// Every stage is resumable: a unit whose artifact already exists is skipped, so
// a partial failure costs only the units that actually failed. Exit status is
// non-zero if any unit failed — an xargs one-liner reported success while doing
// nothing at all, which is the failure mode this replaces.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIR = "experiments/correlation";
const AUDITS = path.join(DIR, "audits");
const UNITS_FILE = path.join(DIR, "units.json");

export const slugOf = (url) => url.replace("https://docs.chain.link/", "").replace(/\//g, "-") || "root";

const PROTOCOL = {
  model: "claude-opus-4-8",
  probeEffort: "medium",
  grader: "claude-sonnet-5",
  probes: 6,
};

function run(args, label) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn("node", ["src/cli.js", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      if (code === 0) console.log(`  ok   ${label} (${secs}s)`);
      else console.log(`  FAIL ${label} (${secs}s) — ${err.trim().split("\n").pop() ?? `exit ${code}`}`);
      resolve({ label, ok: code === 0, error: code === 0 ? null : err.trim() });
    });
  });
}

async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) out.push(await fn(items[i++]));
    }),
  );
  return out;
}

const readUnits = () => JSON.parse(fs.readFileSync(UNITS_FILE, "utf8"));

const STAGES = {
  audit: () => {
    const urls = fs.readFileSync(path.join(DIR, "candidates.txt"), "utf8").trim().split("\n").filter(Boolean);
    fs.mkdirSync(AUDITS, { recursive: true });
    return urls.map((url) => {
      const out = path.join(AUDITS, `${slugOf(url)}.md`);
      return { skip: fs.existsSync(out), label: slugOf(url), args: ["score", url, "-o", out] };
    });
  },

  probes: () =>
    readUnits().map((u) => ({
      skip: fs.existsSync(u.probes),
      label: u.slug,
      args: ["gen-probes", u.url, "-n", String(PROTOCOL.probes), "-o", u.probes],
    })),

  web: () => stageProbeRun("web"),
  closed: () => stageProbeRun("closed"),
};

/**
 * A probe run writes its answers before the grading batch returns, so an
 * existing file is not a finished one. Resuming on existence alone would
 * silently leave an ungraded unit in the study forever.
 */
function isGraded(file) {
  if (!fs.existsSync(file)) return false;
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return (j.graded_count ?? 0) > 0;
  } catch {
    return false; // truncated mid-write — re-run it
  }
}

function stageProbeRun(mode) {
  return readUnits().map((u) => {
    const out = path.join(DIR, "runs", `${u.slug}-${mode}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    return {
      skip: isGraded(out),
      label: `${u.slug} [${mode}]`,
      args: [
        "probe", u.probes,
        "-m", PROTOCOL.model,
        "--probe-effort", PROTOCOL.probeEffort,
        "--grader-model", PROTOCOL.grader,
        "--mode", mode,
        "--batch",
        "-o", out,
      ],
    };
  });
}

// Guarded: build-units.mjs imports slugOf from here, and an unguarded CLI body
// would run the stage machinery on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  const stage = process.argv[2];
  const concurrency = Number(process.argv[3] ?? 4);
  if (!STAGES[stage]) {
    console.error(`unknown stage "${stage}" — expected one of: ${Object.keys(STAGES).join(", ")}`);
    process.exit(2);
  }

  const jobs = STAGES[stage]();
  const todo = jobs.filter((j) => !j.skip);
  console.log(`stage ${stage}: ${todo.length} to run, ${jobs.length - todo.length} already done, concurrency ${concurrency}`);

  const results = await pool(todo, concurrency, (j) => run(j.args, j.label));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} succeeded`);
  if (failed.length) {
    for (const f of failed) console.log(`FAILED ${f.label}`);
    process.exit(1);
  }
}
