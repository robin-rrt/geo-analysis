// Move measurement data between machines.
//
// A clone has no data. `results/runs/` is gitignored — deliberately, because it
// is generated, changes on every run, and would conflict on every branch — so a
// fresh checkout can run the tool but has nothing to show. Re-measuring to get
// it back would cost the ~$46 and several hours already spent.
//
// Only `runs/` travels. `dashboard/` is a pure projection and is rebuilt on
// import, so it is never in the archive: shipping a derived copy invites the
// two drifting apart.
//
// 11MB of runs compresses to about 2.2MB — small enough to email, drop in a
// shared folder, or attach to a release.
//
//   node scripts/data-archive.mjs export [file.tgz]
//   node scripts/data-archive.mjs import <file.tgz>
//
// Uses the system `tar` rather than a dependency, to keep the CLI at four
// runtime deps. Present by default on macOS, Linux and Windows 10+.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { listRuns, RUNS_DIR } from "../src/store/run.js";
import { project } from "../src/store/project.js";

const ROOT = "results";
const [mode, arg] = process.argv.slice(2);
const runsPath = path.join(ROOT, RUNS_DIR);

const runIds = () => {
  try {
    return fs.readdirSync(runsPath, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

function doExport(file = `geo-data-${new Date().toISOString().slice(0, 10)}.tgz`) {
  const ids = runIds();
  if (!ids.length) {
    console.error(`nothing to export — ${runsPath} is empty`);
    process.exit(1);
  }
  execFileSync("tar", ["czf", file, "-C", ROOT, RUNS_DIR], { stdio: "inherit" });
  const mb = (fs.statSync(file).size / 1048576).toFixed(1);
  console.log(`${file} — ${ids.length} run(s), ${mb}MB`);
  console.log(`\nOn the other machine:\n  node scripts/data-archive.mjs import ${path.basename(file)}`);
}

function doImport(file) {
  if (!file) {
    console.error("usage: node scripts/data-archive.mjs import <file.tgz>");
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    console.error(`no such archive: ${file}`);
    process.exit(1);
  }

  const before = new Set(runIds());
  fs.mkdirSync(ROOT, { recursive: true });

  // `-k` keeps existing files rather than overwriting them. Runs are immutable,
  // so a run id that already exists holds identical content; refusing to
  // clobber means an import can never damage local measurements that the
  // archive happens not to contain.
  try {
    execFileSync("tar", ["xzkf", file, "-C", ROOT], { stdio: "pipe" });
  } catch (err) {
    // tar exits non-zero when it skips existing files. That is the intended
    // path, not a failure — distinguish it from a real extraction error.
    const text = String(err.stderr ?? "");
    if (!/Already exists|not overwritten/i.test(text)) {
      console.error(`extraction failed: ${text.trim() || err.message}`);
      process.exit(1);
    }
  }

  const after = runIds();
  const added = after.filter((id) => !before.has(id));
  console.log(`imported ${added.length} new run(s); ${after.length} total (${before.size} were already here)`);

  // Rebuild rather than ship: the projection is derived, and deriving it here
  // guarantees it matches the runs that actually landed.
  const summary = project(ROOT);
  console.log(`rebuilt the dashboard: ${summary.pages} pages, ${summary.products} targets, ${summary.points} trend points`);

  const manifests = listRuns(ROOT);
  const spend = manifests.reduce((a, m) => a + (m.cost?.measured ?? 0), 0);
  console.log(`measurement value recovered: $${spend.toFixed(2)} of runs`);
}

if (mode === "export") doExport(arg);
else if (mode === "import") doImport(arg);
else {
  console.error("usage: node scripts/data-archive.mjs export [file.tgz] | import <file.tgz>");
  process.exit(2);
}
