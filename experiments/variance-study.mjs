#!/usr/bin/env node
// Phase 4 variance study.
//
// Question 1: do deterministic facts reduce run-to-run score variance?
// Question 2: does the priority rule stop facts from reordering recommendations?
//
// Design: 3 conditions x 2 pages x 3 runs = 18 audits.
//   A  no facts                 (pre-checks baseline)
//   B  facts                    (as committed)
//   C  facts + priority rule    (the unvalidated prompt edit)
//
// n=3 estimates a spread crudely. Treat a difference smaller than the within-
// condition spread as unresolved, not as a result.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const run = promisify(execFile);
const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(import.meta.dirname, "out");
const PROMPT = path.join(ROOT, "prompts", "geo-audit.md");

const PAGES = [
  { slug: "non-determinism-go", url: "https://docs.chain.link/cre/concepts/non-determinism-go" },
  {
    slug: "vrf-migration-ts",
    url: "https://documentation-git-vrf-migration-guide-chainlinklabs.vercel.app/cre/reference/vrf-migration-ts",
  },
];
const RUNS = 3;
const CONCURRENCY = 3;

// The paragraph under test, identified by its opening sentence.
const RULE_START = "**Facts are evidence for scoring. They must not drive recommendation priority.**";

function promptWithRule(text, want) {
  const has = text.includes(RULE_START);
  if (want === has) return text;
  if (want) throw new Error("cannot re-add the rule: run from a working tree that contains it");
  // Strip from the marker through the end of that paragraph (blank line).
  const i = text.indexOf(RULE_START);
  const end = text.indexOf("\n\n", i);
  return text.slice(0, i) + text.slice(end + 2);
}

const CONDITIONS = [
  { id: "A", label: "no facts", facts: false, rule: false },
  { id: "B", label: "facts", facts: true, rule: false },
  { id: "C", label: "facts + priority rule", facts: true, rule: true },
];

async function audit(cond, page, runIdx) {
  const out = path.join(OUT, `${cond.id}-${page.slug}-run${runIdx}.md`);
  const args = ["src/cli.js", "score", page.url, "-o", out];
  if (!cond.facts) args.push("--no-facts");
  const started = Date.now();
  try {
    await run("node", args, { cwd: ROOT, timeout: 900_000, maxBuffer: 1 << 26 });
    return { ok: true, out, secs: Math.round((Date.now() - started) / 1000) };
  } catch (err) {
    return { ok: false, out, error: err.message.split("\n")[0] };
  }
}

/** Pull the numbers and rankings back out of a finished report. */
function parseReport(file) {
  if (!fs.existsSync(file)) return null;
  const md = fs.readFileSync(file, "utf8");
  const total = Number(md.match(/^## GEO Score: (\d+)\/100/m)?.[1]);
  const dims = {};
  for (const m of md.matchAll(/^\|\s*(?!Dimension|\*\*Total)([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/gm)) {
    dims[m[1].trim()] = Number(m[3]);
  }
  const recs = [...md.matchAll(/^- \*\*\[P(\d)\]\s*(.+?)\*\*/gm)].map((m) => ({
    priority: Number(m[1]),
    title: m[2].trim(),
  }));
  return { total, dims, recs, p1: recs.filter((r) => r.priority === 1).map((r) => r.title) };
}

const spread = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : null);
const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

async function pool(jobs, limit) {
  const results = [];
  for (let i = 0; i < jobs.length; i += limit) {
    results.push(...(await Promise.all(jobs.slice(i, i + limit).map((j) => j()))));
  }
  return results;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const original = fs.readFileSync(PROMPT, "utf8");
  if (!original.includes(RULE_START)) {
    throw new Error("priority rule not found in prompts/geo-audit.md — condition C needs it present");
  }

  const log = (s) => process.stderr.write(s + "\n");
  const total = CONDITIONS.length * PAGES.length * RUNS;
  log(`Variance study: ${CONDITIONS.length} conditions x ${PAGES.length} pages x ${RUNS} runs = ${total} audits\n`);

  try {
    for (const cond of CONDITIONS) {
      // Swap the prompt for this condition, then run its whole batch.
      fs.writeFileSync(PROMPT, promptWithRule(original, cond.rule));
      log(`--- condition ${cond.id} (${cond.label})`);

      const jobs = [];
      for (const page of PAGES) {
        for (let r = 1; r <= RUNS; r++) jobs.push(() => audit(cond, page, r));
      }
      const results = await pool(jobs, CONCURRENCY);
      for (const r of results) {
        log(`    ${r.ok ? "ok" : "FAIL"}  ${path.basename(r.out)}${r.ok ? ` (${r.secs}s)` : ` — ${r.error}`}`);
      }
    }
  } finally {
    fs.writeFileSync(PROMPT, original); // always restore
    log("\nprompt restored");
  }

  // ------------------------------------------------------------- report ----
  const rows = [];
  for (const cond of CONDITIONS) {
    for (const page of PAGES) {
      const parsed = Array.from({ length: RUNS }, (_, i) =>
        parseReport(path.join(OUT, `${cond.id}-${page.slug}-run${i + 1}.md`)),
      ).filter(Boolean);
      rows.push({ cond, page, parsed });
    }
  }

  const lines = [];
  lines.push("# Variance study results", "");
  lines.push(`Generated ${new Date().toISOString()} · ${RUNS} runs per condition per page`, "");

  lines.push("## Total score", "");
  lines.push("| Condition | Page | Runs | Mean | Spread (max-min) |");
  lines.push("|---|---|---|--:|--:|");
  for (const { cond, page, parsed } of rows) {
    const totals = parsed.map((p) => p.total).filter(Number.isFinite);
    lines.push(
      `| ${cond.id} ${cond.label} | ${page.slug} | ${totals.join(", ") || "—"} | ` +
        `${mean(totals) ?? "—"} | **${spread(totals) ?? "—"}** |`,
    );
  }

  lines.push("", "## Per-dimension spread", "");
  lines.push("Spread of each dimension's 0-10 score across runs. Lower is more reproducible.", "");
  const dimNames = [...new Set(rows.flatMap((r) => r.parsed.flatMap((p) => Object.keys(p.dims))))];
  lines.push(`| Dimension | ${CONDITIONS.map((c) => c.id).join(" | ")} |`);
  lines.push(`|---|${CONDITIONS.map(() => "--:").join("|")}|`);
  for (const d of dimNames) {
    const cells = CONDITIONS.map((c) => {
      const vals = rows.filter((r) => r.cond.id === c.id).flatMap((r) => r.parsed.map((p) => p.dims[d]).filter(Number.isFinite));
      // Spread within each page, then averaged, so cross-page differences don't inflate it.
      const perPage = rows
        .filter((r) => r.cond.id === c.id)
        .map((r) => spread(r.parsed.map((p) => p.dims[d]).filter(Number.isFinite)))
        .filter((v) => v !== null);
      return perPage.length ? mean(perPage) : "—";
    });
    lines.push(`| ${d} | ${cells.join(" | ")} |`);
  }

  lines.push("", "## P1 recommendations by condition", "");
  lines.push("Question 2: does the priority rule keep retrieval/prior fixes at P1?", "");
  for (const { cond, page, parsed } of rows) {
    lines.push(`**${cond.id} (${cond.label}) — ${page.slug}**`, "");
    parsed.forEach((p, i) => lines.push(`- run ${i + 1}: ${p.p1.join(" · ") || "(none)"}`));
    lines.push("");
  }

  const reportPath = path.join(import.meta.dirname, "results.md");
  fs.writeFileSync(reportPath, lines.join("\n") + "\n");
  log(`\nWrote ${reportPath}`);
  process.stdout.write(lines.join("\n") + "\n");
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
