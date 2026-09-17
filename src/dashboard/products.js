// Collect product-level artifacts for the dashboard.
//
// A product directory holds a ledger (pages.json), a deterministic rollup
// (rollup.json), and optionally an LLM audit and probe runs. The product audit
// uses a different report template from page audits, so it is not run through
// parseAudit — only its headline and summary are lifted.

import fs from "node:fs";
import path from "node:path";
import { retrievalTier } from "../retrieval.js";

export const PRODUCTS_DIR = "products";

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** Headline and summary from a product audit report, without a full parse. */
function readAudit(file) {
  if (!fs.existsSync(file)) return null;
  const md = fs.readFileSync(file, "utf8");
  const summary = md.match(/^## Summary\s*$([\s\S]*?)(?=^## )/m)?.[1]?.trim() ?? null;
  const recs = [...md.matchAll(/^- \*\*\[P(\d)\]\s*(.+?)\*\*\s*—\s*\*(.+?)\*/gm)].map((m) => ({
    priority: Number(m[1]),
    title: m[2].trim(),
    meta: m[3].trim(),
  }));
  return {
    file: path.basename(file),
    generated: md.match(/^\*\*Generated:\*\* (.+)$/m)?.[1] ?? null,
    summary,
    recommendations: recs,
  };
}

/**
 * Tier breakdown for a product probe run. Recomputed rather than read, because
 * runs recorded before tiering shipped carry `tier: null` — and the first real
 * product run is one of them.
 */
function tierBreakdown(run, probeSet) {
  if (!probeSet?.scope_urls?.length) return null;
  const byId = new Map((probeSet.probes ?? []).map((p) => [p.id, p]));
  const counts = { exact: 0, "in-scope": 0, "out-of-scope": 0, none: 0 };
  let judged = 0;

  for (const r of run.results ?? []) {
    if (run.mode !== "web") continue; // closed mode has no retrieval to tier
    const probe = byId.get(r.probe_id);
    if (!probe) continue;
    const stored = r.retrieval?.tier;
    const tier =
      stored ??
      retrievalTier({
        citedUrls: r.retrieval?.cited_urls ?? [],
        answer: r.answer ?? "",
        expectedUrls: probe.expected_source_urls ?? [],
        scopeUrls: probeSet.scope_urls,
      }).tier;
    if (tier in counts) {
      counts[tier] += 1;
      judged += 1;
    }
  }
  if (!judged) return null;
  const rate = (n) => Math.round((n / judged) * 100) / 100;
  return {
    ...counts,
    judged,
    exactRate: rate(counts.exact),
    inScopeRate: rate(counts.exact + counts["in-scope"]),
    recomputed: (run.results ?? []).some((r) => r.retrieval?.tier == null),
  };
}

function collectProduct(dir, name) {
  const rollup = readJson(path.join(dir, "rollup.json"));
  const ledger = readJson(path.join(dir, "pages.json"));
  if (!rollup) return null;

  const probeSet = readJson(path.join(dir, "probes.json"));
  const probeRuns = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("probe-results-") && f.endsWith(".json"))
    .map((f) => {
      const run = readJson(path.join(dir, f));
      if (!run) return null;
      const graded = (run.results ?? []).filter((r) => Number.isFinite(r.fidelity));
      return {
        file: f,
        model: run.model_tested,
        mode: run.mode,
        runAt: run.run_at,
        probeCount: run.probe_count ?? (run.results ?? []).length,
        avgFidelity: run.avg_fidelity ?? null,
        hitRate: run.retrieval_hit_rate ?? null,
        gradedCount: graded.length,
        tiers: tierBreakdown(run, probeSet),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.runAt).localeCompare(String(a.runAt)));

  return {
    name,
    scope: rollup.scope,
    score: rollup.score,
    generatedAt: rollup.generatedAt,
    counts: { ...(ledger?.counts ?? {}), ...rollup.counts },
    notes: ledger?.notes ?? [],
    checks: rollup.checks ?? [],
    potentialFixes: rollup.potentialFixes ?? [],
    audit: readAudit(path.join(dir, "audit.md")),
    probeSet: probeSet
      ? {
          probeCount: probeSet.probes?.length ?? 0,
          scopePages: probeSet.scope_urls?.length ?? 0,
          contextStrategy: probeSet.context_strategy ?? null,
          contextTokens: probeSet.context_tokens_estimated ?? null,
          multiPageProbes: (probeSet.probes ?? []).filter(
            (p) => (p.expected_source_urls ?? []).length > 1,
          ).length,
        }
      : null,
    probeRuns,
  };
}

/** Every product under `<resultsDir>/products/`. Empty when the directory is absent. */
export function collectProducts(resultsDir) {
  const root = path.join(resultsDir, PRODUCTS_DIR);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => collectProduct(path.join(root, e.name), e.name))
    .filter(Boolean)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
}
