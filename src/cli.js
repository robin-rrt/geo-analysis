#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { extractPage, buildPageContent } from "./extract.js";
import { runAudit } from "./analyze.js";
import { genProbes, slugFromUrl } from "./probes.js";
import { runProbes } from "./evaluate.js";
import { collect } from "./dashboard/collect.js";
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
      --no-facts        Omit the deterministic measured-facts block from the prompt
                        (reproduces pre-checks behaviour; for A/B comparison)

gen-probes:
  -n, --n <count>       Number of probes to generate (default: 10)
  -m, --model <id>      Generator model (default: by effort — see above)

probe:
  -m, --model <id>      Model under test (default: ${DEFAULT_PROBE_TARGET})
      --mode <mode>     web | closed (default: web — retrieval enabled)
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
      "no-facts": { type: "boolean", default: false },
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
    probeResults = JSON.stringify(parsed, null, 2);
  }

  process.stderr.write(`Fetching ${url} ...\n`);
  const page = await extractPage(url);
  const pageContent = buildPageContent(page, { facts: !values["no-facts"] });

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
  process.stderr.write(`Generating ${n} probes with ${model} (effort: ${values.effort}) ...\n`);

  const { probes, page } = await genProbes({
    url,
    n,
    model,
    effort: values.effort,
    fallback: !values["no-fallback"],
  });

  const outFile =
    values.output ?? resultsPath(slugFromUrl(page.finalUrl ?? url), "probes.json");
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

  const summary = await runProbes({
    probesFile,
    model: values.model,
    graderModel,
    mode: values.mode,
    effort: values.effort,
    log: (msg) => process.stderr.write(msg),
  });

  const slug = slugFromUrl(summary.source_url);
  const modelShort = values.model.replace(/^claude-/, "");
  const outFile =
    values.output ?? resultsPath(slug, `probe-results-${modelShort}-${summary.mode}.json`);
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2) + "\n");

  const hitPct = Math.round(summary.retrieval_hit_rate * 100);
  const effective =
    summary.inconclusive_miss_count > 0 && summary.retrieval_hit_rate_effective !== null
      ? ` (effective ${Math.round(summary.retrieval_hit_rate_effective * 100)}% — ` +
        `${summary.inconclusive_miss_count} inconclusive miss(es) excluded)`
      : "";
  process.stderr.write(
    `\n${summary.model_tested} (${summary.mode}) on "${summary.source_title}"\n` +
      `  graded by ${summary.grader_model} · avg fidelity: ${summary.avg_fidelity}/100 · ` +
      `retrieval hit rate: ${hitPct}%${effective}\n` +
      `  avg scores — accuracy ${summary.avg_scores.accuracy}, ` +
      `hallucination-free ${summary.avg_scores.hallucination_free}, ` +
      `relevance ${summary.avg_scores.relevance}, structure ${summary.avg_scores.structure}\n`,
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
  process.stderr.write(`\nResults written to ${outFile}\n`);
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
