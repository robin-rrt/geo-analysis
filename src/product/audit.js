// Product audit: one LLM call over the deterministic rollup plus a few sampled
// pages — never one call per page.
//
// Auditing 725 CCIP pages individually would cost ~$127 at the measured
// $0.1748/audit. The rollup already carries the mechanical findings; the model
// is here to judge what the counts mean and what to do about them.

import { runClaude } from "../claude.js";
import { stripReportFence } from "../analyze.js";

/** Pages shown in full. Small on purpose — the rollup carries the breadth. */
const DEFAULT_SAMPLE_LIMIT = 6;
const MAX_SAMPLE_CHARS = 12_000;

/**
 * Choose which pages to show in full: the worst offenders on the highest-weight
 * failing checks, plus one median-length page so the model sees what ordinary
 * looks like rather than only the outliers.
 */
export function selectSamples(view, pages, limit = DEFAULT_SAMPLE_LIMIT) {
  const byUrl = new Map(pages.filter((p) => p.fetched && p.page).map((p) => [p.url, p]));
  const chosen = new Map();
  const reasons = new Map();

  const take = (url, reason) => {
    if (chosen.size >= limit || chosen.has(url) || !byUrl.has(url)) return;
    chosen.set(url, byUrl.get(url));
    reasons.set(url, reason);
  };

  // Heaviest failing checks first; within a check, hard failures before warnings.
  const failing = view.checks
    .filter((c) => c.points !== null && c.points < 1 && c.findings.length)
    .sort((a, b) => b.weight * (1 - b.points) - a.weight * (1 - a.points));

  for (const check of failing) {
    const worst = check.findings.find((f) => f.verdict === "fail") ?? check.findings[0];
    if (worst) take(worst.url, `worst offender for ${check.id}`);
  }

  // A median-length page: the outliers alone would misrepresent the corpus.
  const rest = [...byUrl.values()].filter((p) => !chosen.has(p.url)).sort((a, b) => a.bytes - b.bytes);
  if (rest.length) take(rest[Math.floor(rest.length / 2)].url, "median-length page");

  return [...chosen.values()].map((p) => ({ ...p, sampleReason: reasons.get(p.url) }));
}

/** The rollup, trimmed to what the model needs — full findings lists are noise. */
function rollupForPrompt(view) {
  return {
    product: view.product,
    scope: view.scope,
    deterministicScore: view.score,
    counts: view.counts,
    checks: view.checks.map((c) => ({
      id: c.id,
      measures: c.describe,
      weight: c.weight,
      evaluatedPages: c.evaluatedPages,
      notApplicable: c.notApplicable,
      pass: c.pass,
      warn: c.warn,
      fail: c.fail,
      points: c.points,
      exampleFindings: c.findings.slice(0, 5),
    })),
    potentialFixes: view.potentialFixes,
  };
}

export function buildAuditContent({ resolved, view, samples }) {
  const parts = [];

  parts.push(
    `# Product: ${view.product}`,
    ``,
    `Scope: **${view.scope}** — ${resolved.counts.inScope} page(s) in scope of ` +
      `${resolved.counts.discovered} discovered (${resolved.counts.curated} in the curated ` +
      `llms.txt index, ${resolved.counts.sitemap} published in the sitemap).`,
    ``,
  );

  if (resolved.notes.length) {
    parts.push(`Scope notes:`, ...resolved.notes.map((n) => `- ${n}`), ``);
  }

  const unfetched = view.counts.unfetched;
  if (unfetched) parts.push(`${unfetched} page(s) could not be fetched and were not assessed.`, ``);

  parts.push(
    `## Deterministic rollup (ground truth — do not recount)`,
    ``,
    "```json",
    JSON.stringify(rollupForPrompt(view), null, 2),
    "```",
    ``,
    `## Sampled pages (${samples.length} of ${view.counts.fetched} shown in full)`,
    ``,
  );

  for (const s of samples) {
    const body = s.page.markdown.slice(0, MAX_SAMPLE_CHARS);
    parts.push(
      `### ${s.title ?? s.url}`,
      `Source: ${s.finalUrl ?? s.url} · format: ${s.page.format ?? "html"} · ` +
        `selected because: ${s.sampleReason}`,
      ``,
      body,
      body.length < s.page.markdown.length ? `\n_[truncated at ${MAX_SAMPLE_CHARS} chars]_` : ``,
      ``,
      `---`,
      ``,
    );
  }

  return parts.join("\n");
}

/** Run the product audit. Returns the markdown report. */
export async function runProductAudit({
  resolved,
  view,
  pages,
  model,
  effort,
  fallback = true,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
  onText,
  tally,
}) {
  const samples = selectSamples(view, pages, sampleLimit);
  const content = buildAuditContent({ resolved, view, samples });

  const report = await runClaude({
    promptFile: "product-audit.md",
    userContent: [
      `Generated at (use as the report's ISO timestamp): ${new Date().toISOString()}`,
      ``,
      content,
    ].join("\n"),
    model,
    effort,
    fallback,
    onText,
    tally,
    tallyLabel: "product-audit",
  });

  return { report: stripReportFence(report), samples };
}
