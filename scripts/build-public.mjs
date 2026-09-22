// Build the public, read-only dashboard for static hosting.
//
// This is the artifact that goes on a domain. It is deliberately NOT
// `geo-audit serve`: the server can start runs that spend money, so it stays on
// loopback. The export is built with the API client swapped out, so the
// published bundle does not contain the code that triggers a run.
//
// Vercel builds from the git repo and has no results/ of its own, so the
// projection under results/dashboard/ must be committed for this to have data.
//
//   node scripts/build-public.mjs [outDir]

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const OUT = process.argv[2] ?? "public-dist";
const BUNDLE = "ui/dist-export/index.html";
const SRC = "results/dashboard";

if (!fs.existsSync(path.join(SRC, "index.json"))) {
  console.error(
    `no projection at ${SRC}/index.json.\n` +
      `The published site has no data without it. Run a target, then commit results/dashboard/.`,
  );
  process.exit(1);
}

// Build the export bundle if it is missing or older than the UI source.
const newestSource = fs
  .readdirSync("ui/src", { recursive: true })
  .map((f) => path.join("ui/src", f))
  .filter((f) => fs.statSync(f).isFile())
  .reduce((a, f) => Math.max(a, fs.statSync(f).mtimeMs), 0);

if (!fs.existsSync(BUNDLE) || fs.statSync(BUNDLE).mtimeMs < newestSource) {
  console.log("building the export bundle...");
  execFileSync("npm", ["--prefix", "ui", "run", "build:export"], { stdio: "inherit" });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
fs.copyFileSync(BUNDLE, path.join(OUT, "index.html"));

let files = 0;
for (const f of ["index.json", "runs.json", "timeseries.json", "products.json"]) {
  if (fs.existsSync(path.join(SRC, f))) {
    fs.copyFileSync(path.join(SRC, f), path.join(OUT, "data", f));
    files++;
  }
}
for (const sub of ["pages", "runs"]) {
  const from = path.join(SRC, sub);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.join(OUT, "data", sub), { recursive: true });
  for (const f of fs.readdirSync(from)) {
    fs.copyFileSync(path.join(from, f), path.join(OUT, "data", sub, f));
    files++;
  }
}

// The promise this artifact makes is structural, so it is checked rather than
// asserted: if the API client ever leaks into the export build, the published
// site could try to start runs.
const html = fs.readFileSync(path.join(OUT, "index.html"), "utf8");
const leaks = ["/api/runs", "/api/estimate", "/api/targets"].filter((p) => html.includes(p));
if (leaks.length) {
  console.error(`REFUSING TO PUBLISH: the bundle contains ${leaks.join(", ")}`);
  process.exit(1);
}

// Three layers, because they fail differently:
//   robots.txt      asks a crawler not to fetch  (ignored by bad actors)
//   X-Robots-Tag    tells it not to index even after fetching  (vercel.json)
//   <meta robots>   survives if the file is copied somewhere without the header
//
// None of these is access control. Anyone with the URL can still read the page —
// for that, use Vercel Deployment Protection.
fs.writeFileSync(
  path.join(OUT, "robots.txt"),
  "# This dashboard is internal. Not for indexing.\nUser-agent: *\nDisallow: /\n",
);

const kb = Math.round(fs.statSync(path.join(OUT, "index.html")).size / 1024);
console.log(`${OUT}/ — index.html (${kb}KB, self-contained) + ${files} data file(s)`);
console.log("read-only: no run-trigger code in the bundle");
