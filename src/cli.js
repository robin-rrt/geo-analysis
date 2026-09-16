#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { extractPage, buildPageContent } from "./extract.js";
import { runAudit } from "./analyze.js";
import { genProbes, slugFromUrl } from "./probes.js";
import { sourceHash } from "./probe-set.js";
import { runProbes } from "./evaluate.js";
import { collect, loadProbeRuns } from "./dashboard/collect.js";
import { pivotRuns, toCsv } from "./dashboard/matrix.js";
import { render } from "./dashboard/render.js";
import { DEFAULT_MODEL, FABLE_MODEL, analystModel } from "./claude.js";

// Load repo-local .env (ANTHROPIC_API_KEY) if present; env vars already set win.
const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];
const DEFAULT_PROBE_TARGET = "claude-opus-4-8";

const USAGE = `geo-audit — GEO toolkit for documentation pages

Usage:
  geo-audit score <url> [options]            Audit a page, print a scored Markdown report
  geo-audit gen-probes <url> [options]       Generate probe prompts + answer key JSON
  geo-audit probe <probes.json> [options]    Ask a model the probes, grade its answers
  geo-audit dashboard [options]              Build an HTML dashboard from results/

Analyst/grader model defaults to ${DEFAULT_MODEL}; ${FABLE_MODEL} is used
automatically at --effort max. Override with -m on score / gen-probes.

Every command saves its artifact under results/<page-slug>/ so the audit,
probes, and probe results for one page sit together:
  results/<slug>/audit.md                        score
  results/<slug>/audit-probe-informed.md         score --probe-results
  results/<slug>/probes.json                     gen-probes
  results/<slug>/probe-results-<model>-<mode>.json   probe
  results/<slug>/probe-matrix.csv                probe, dashboard (probes × models)
-o overrides the path; score additionally streams the report to stdout.

Common options:
  -o, --output <file>   Output file (defaults above)
  -e, --effort <level>  ${EFFORT_LEVELS.join(" | ")} (default: high)
      --no-fallback     Disable the automatic Opus 4.8 refusal fallback (Fable only)
  -h, --help            Show this help

score:
  -m, --model <id>      Auditor model (default: by effort — see above)
  -p, --probe-results <file>
                        Probe run JSON for this page (from \`probe\`); the audit
                        then includes a probe-informed diagnosis — score vs
                        fidelity reframe, retrieval hit/miss split, miss triage,
                        parametric overrides, inversions, and tiered fixes
      --dump-content    Print the extracted page content and exit (no API call)

gen-probes:
  -n, --n <count>       Number of probes to generate (default: 10)
  -m, --model <id>      Generator model (default: by effort — see above)
  -f, --force           Regenerate even if the page content is unchanged
      --allow-thin      Generate even if the page extracts to almost no content
                        (default: refuse — a nav shell yields probes about nothing)

probe:
  -m, --model <id>      Model under test (default: ${DEFAULT_PROBE_TARGET})
      --mode <mode>     web | closed (default: web — retrieval enabled)
  -f, --force           Re-run every probe. By default a run resumes: probes already
                        answered for this probe set, model, mode, and grader are kept
                        [grader model: by effort — see above]

dashboard:                                   (no API calls — reads results/ only)
      --results-dir <dir>  Directory to read (default: results)
      --json               Also write results/dashboard-data.json
  -o, --output <file>      Output file (default: results/dashboard.html)

Auth: uses ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, an \`ant auth login\` profile,
or a repo-local .env file containing ANTHROPIC_API_KEY.`;

function usageExit(code = 1) {
  console.log(USAGE);
  process.exit(code);
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function checkEffort(effort) {
  if (!EFFORT_LEVELS.includes(effort)) {
    fail(`invalid effort "${effort}" — use one of: ${EFFORT_LEVELS.join(", ")}`);
  }
}

function checkUrl(url) {
  if (!url) usageExit();
  if (!/^https?:\/\//.test(url)) fail(`not an http(s) URL: ${url}`);
}

// All artifacts for one page live under results/<slug>/ so the audit, probes,
// and probe results that belong together are grouped by folder.
function resultsPath(slug, filename) {
  const dir = path.join("results", slug);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}

// Same page modulo scheme/host-case/trailing slash — guards against scoring a
// page with another page's probe run.
function urlsMatch(a, b) {
  const norm = (u) => {
    try {
      const p = new URL(u);
      return `${p.host.toLowerCase()}${p.pathname.replace(/\/+$/, "")}`;
    } catch {
      return u;
    }
  };
  return norm(a) === norm(b);
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Write-then-rename, so an interrupted run never leaves a half-written file.
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

// Per-page probe × model table, rebuilt from the page's current run files.
function writeProbeMatrix(dir) {
  if (!fs.existsSync(path.join(dir, "probes.json"))) return null;
  const { probeSet, runs } = loadProbeRuns(dir);
  const current = runs.filter((r) => r.current);
  if (!current.length) return null;
  const file = path.join(dir, "probe-matrix.csv");
  fs.writeFileSync(file, toCsv(pivotRuns(current, probeSet.probes)));
  return file;
}

// ---------------------------------------------------------------- score ----

async function cmdScore(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      effort: { type: "string", short: "e", default: "high" },
      model: { type: "string", short: "m" },
      "probe-results": { type: "string", short: "p" },
      "no-fallback": { type: "boolean", default: false },
      "dump-content": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) usageExit(0);
  const url = positionals[0];
  checkUrl(url);
  checkEffort(values.effort);
  const model = analystModel(values.effort, values.model);

  let probeResults;
  if (values["probe-results"]) {
    const file = values["probe-results"];
    if (!fs.existsSync(file)) fail(`probe results file not found: ${file}`);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      fail(`probe results file is not valid JSON: ${file}`);
    }
    if (!Array.isArray(parsed.results)) {
      fail(`probe results file has no "results" array — expected \`probe\` output: ${file}`);
    }
    if (parsed.source_url && !urlsMatch(parsed.source_url, url)) {
      fail(
        `probe results are for ${parsed.source_url}, not ${url} — ` +
          `pass the probe run for the page being scored`,
      );
    }
    // Token accounting is for the operator, not the auditor — keep it out of the prompt.
    const { usage: _usage, ...run } = parsed;
    run.results = run.results.map(({ usage: _resultUsage, ...r }) => r);
    probeResults = JSON.stringify(run, null, 2);
  }

  process.stderr.write(`Fetching ${url} ...\n`);
  const page = await extractPage(url);
  const pageContent = buildPageContent(page);

  if (values["dump-content"]) {
    process.stdout.write(pageContent + "\n");
    return;
  }

  process.stderr.write(
    `Auditing "${page.title}" with ${model} (effort: ${values.effort}` +
      `${probeResults ? ", probe-informed" : ""}) ...\n\n`,
  );

  // Default output: results/<slug>/audit[-probe-informed].md. With an auto
  // path the report also streams to stdout live; with -o show dot progress.
  const explicit = Boolean(values.output);
  const outFile =
    values.output ??
    resultsPath(
      slugFromUrl(page.finalUrl ?? url),
      probeResults ? "audit-probe-informed.md" : "audit.md",
    );
  const onText = explicit ? () => process.stderr.write(".") : (t) => process.stdout.write(t);

  const report = await runAudit({
    url: page.finalUrl ?? url,
    pageContent,
    probeResults,
    model,
    effort: values.effort,
    fallback: !values["no-fallback"],
    onText,
  });

  if (!explicit && !report.endsWith("\n")) process.stdout.write("\n");
  fs.writeFileSync(outFile, report.endsWith("\n") ? report : report + "\n");
  process.stderr.write(`\nReport written to ${outFile}\n`);
}

// ----------------------------------------------------------- gen-probes ----

async function cmdGenProbes(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      n: { type: "string", short: "n", default: "10" },
      model: { type: "string", short: "m" },
      output: { type: "string", short: "o" },
      effort: { type: "string", short: "e", default: "high" },
      "no-fallback": { type: "boolean", default: false },
      force: { type: "boolean", short: "f", default: false },
      "allow-thin": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) usageExit(0);
  const url = positionals[0];
  checkUrl(url);
  checkEffort(values.effort);
  const n = Number.parseInt(values.n, 10);
  if (!Number.isInteger(n) || n < 1 || n > 50) fail(`invalid --n "${values.n}" (1-50)`);
  const model = analystModel(values.effort, values.model);

  process.stderr.write(`Fetching ${url} ...\n`);
  const page = await extractPage(url);
  const outFile =
    values.output ?? resultsPath(slugFromUrl(page.finalUrl ?? url), "probes.json");

  // Probes derive from the page content. Regenerating for unchanged content
  // buys only a different-but-equivalent set, and orphans every run that
  // answered the current one.
  const existing = values.force ? null : readJsonOrNull(outFile);
  if (existing?.source_content && sourceHash(existing.source_content) === sourceHash(page.markdown)) {
    process.stderr.write(
      `Page content unchanged since ${outFile} was generated — nothing to do ` +
        `(use --force to regenerate).\n`,
    );
    return;
  }

  process.stderr.write(`Generating ${n} probes with ${model} (effort: ${values.effort}) ...\n`);
  const { probes } = await genProbes({
    url,
    page,
    n,
    model,
    effort: values.effort,
    fallback: !values["no-fallback"],
    allowThin: values["allow-thin"],
  });
  fs.writeFileSync(outFile, JSON.stringify(probes, null, 2) + "\n");

  process.stderr.write(`\n${probes.probes.length} probes for "${probes.source_title}":\n`);
  for (const p of probes.probes) {
    process.stderr.write(`  ${p.id} [${p.archetype}] ${p.prompt}\n`);
  }
  process.stderr.write(`\nProbe set written to ${outFile}\n`);
}

// ----------------------------------------------------------------- probe ----

async function cmdProbe(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      model: { type: "string", short: "m", default: DEFAULT_PROBE_TARGET },
      mode: { type: "string", default: "web" },
      force: { type: "boolean", short: "f", default: false },
      output: { type: "string", short: "o" },
      effort: { type: "string", short: "e", default: "high" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) usageExit(0);
  const probesFile = positionals[0];
  if (!probesFile) usageExit();
  if (!fs.existsSync(probesFile)) fail(`probes file not found: ${probesFile}`);
  if (!["web", "closed"].includes(values.mode)) fail(`invalid --mode "${values.mode}" (web|closed)`);
  checkEffort(values.effort);
  const graderModel = analystModel(values.effort);

  const probeSet = readJsonOrNull(probesFile);
  if (!probeSet?.source_url) fail(`not a probes file (no source_url): ${probesFile}`);
  const slug = slugFromUrl(probeSet.source_url);
  const modelShort = values.model.replace(/^claude-/, "");
  const outFile =
    values.output ?? resultsPath(slug, `probe-results-${modelShort}-${values.mode}.json`);

  const summary = await runProbes({
    probesFile,
    model: values.model,
    graderModel,
    mode: values.mode,
    effort: values.effort,
    previous: values.force ? null : readJsonOrNull(outFile),
    // Persist after every batch, so an interrupted run resumes where it stopped.
    onProgress: (partial) => writeJsonAtomic(outFile, partial),
    log: (msg) => process.stderr.write(msg),
  });
  writeJsonAtomic(outFile, summary);

  const pct = (r) => `${Math.round(r * 100)}%`;
  const hitRate =
    summary.retrieval_hit_rate === null ? "n/a (closed mode)" : pct(summary.retrieval_hit_rate);
  const mentions =
    summary.retrieval_mention_hit_count > 0
      ? ` (${summary.retrieval_mention_hit_count} by in-text mention)`
      : "";
  const effective =
    summary.inconclusive_miss_count > 0 && summary.retrieval_hit_rate_effective !== null
      ? ` (effective ${pct(summary.retrieval_hit_rate_effective)} — ` +
        `${summary.inconclusive_miss_count} inconclusive miss(es) excluded)`
      : "";
  const s = summary.avg_scores;
  const tokens = (u) =>
    `in ${u.input_tokens.toLocaleString()} / out ${u.output_tokens.toLocaleString()} ` +
    `/ cache-read ${u.cache_read_input_tokens.toLocaleString()}`;
  process.stderr.write(
    `\n${summary.model_tested} (${summary.mode}) on "${summary.source_title}"\n` +
      `  graded by ${summary.grader_model} · avg fidelity: ${summary.avg_fidelity ?? "—"}/100 · ` +
      `retrieval hit rate: ${hitRate}${mentions}${effective}\n` +
      (s
        ? `  avg scores — accuracy ${s.accuracy}, hallucination-free ${s.hallucination_free}, ` +
          `relevance ${s.relevance}, structure ${s.structure}\n`
        : "") +
      (summary.refusal_count > 0 ? `  ${summary.refusal_count} refusal(s) — not graded\n` : "") +
      `  tokens — model under test ${tokens(summary.usage.model_under_test)} · ` +
      `grader ${tokens(summary.usage.grader)}\n`,
  );
  if (summary.live_search_failed_count > 0 || summary.search_degraded_count > 0) {
    process.stderr.write(
      `\n  WARNING: live web search did not work reliably during this run —\n` +
        `  ${summary.live_search_failed_count} probe(s) got zero search results, ` +
        `${summary.search_degraded_count} hit rate limits after retries.\n` +
        `  Their misses are inconclusive (excluded from the effective hit rate); ` +
        `treat raw retrieval numbers with caution and consider re-running.\n`,
    );
  }
  if (summary.error_count > 0) {
    process.stderr.write(
      `\n  ${summary.error_count} probe(s) failed — re-run the same command to retry just those.\n`,
    );
  }
  process.stderr.write(`\nResults written to ${outFile}\n`);
  const matrix = writeProbeMatrix(path.join("results", slug));
  if (matrix) process.stderr.write(`Probe matrix written to ${matrix}\n`);
}

// ------------------------------------------------------------- dashboard ----

async function cmdDashboard(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      "results-dir": { type: "string", default: "results" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) usageExit(0);

  const resultsDir = values["results-dir"];
  process.stderr.write(`Reading ${resultsDir}/ ...\n`);

  let data;
  try {
    data = collect(resultsDir);
  } catch (err) {
    fail(err.message);
  }

  const outFile = values.output ?? path.join(resultsDir, "dashboard.html");
  fs.writeFileSync(outFile, render(data));

  // Refresh every page's probe × model table alongside the dashboard.
  const matrices = fs
    .readdirSync(resultsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => writeProbeMatrix(path.join(resultsDir, e.name)))
    .filter(Boolean);

  if (values.json) {
    const jsonFile = path.join(resultsDir, "dashboard-data.json");
    fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2) + "\n");
    process.stderr.write(`Data written to ${jsonFile}\n`);
  }

  const { aggregates: agg } = data;
  const sizeKb = Math.round(fs.statSync(outFile).size / 1024);
  process.stderr.write(
    `\n${agg.pageCount} pages (${agg.probedPageCount} probed) · ${agg.probeCount} probes\n` +
      `  median score ${agg.medianScore} · median fidelity ${agg.medianFidelity ?? "—"} · ` +
      `hit rate ${agg.hitRate === null ? "—" : Math.round(agg.hitRate * 100) + "%"}\n`,
  );
  for (const note of agg.coverageNotes) process.stderr.write(`  note: ${note}\n`);
  process.stderr.write(`\nDashboard written to ${outFile} (${sizeKb} KB)\n`);
  if (matrices.length) {
    process.stderr.write(`Probe matrices refreshed for ${matrices.length} page(s)\n`);
  }
}

// ------------------------------------------------------------- dispatch ----

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help") usageExit(!cmd ? 1 : 0);

  // Convenience: `geo-audit <url>` behaves as `geo-audit score <url>`.
  if (/^https?:\/\//.test(cmd)) return cmdScore([cmd, ...rest]);

  switch (cmd) {
    case "score":
      return cmdScore(rest);
    case "gen-probes":
      return cmdGenProbes(rest);
    case "probe":
      return cmdProbe(rest);
    case "dashboard":
      return cmdDashboard(rest);
    default:
      fail(`unknown command "${cmd}" — expected score, gen-probes, probe, or dashboard`);
  }
}

main().catch((err) => fail(err.message ?? String(err)));
