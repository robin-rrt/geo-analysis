// Assemble product-level context for probe generation, under a token budget.
//
// Measured on docs.chain.link (2026-09-10): ace 60,296 tokens · vrf 142,734 ·
// data-streams 237,760 · ccip ~1.16M. The CCIP bundle exceeds the 1M context
// window outright, so "just send the bundle" cannot be the only strategy —
// large products must fall back to a selection of pages.

const CHARS_PER_TOKEN = 3.6; // measured across three real bundles; used only to pre-screen

/** Cheap estimate so an oversized bundle can be rejected without an API call. */
export const estimateTokens = (text) => Math.ceil((text?.length ?? 0) / CHARS_PER_TOKEN);

/**
 * Default budget for product context. Well under the 1M window: probes,
 * answers, grading, and the model's own output all have to fit alongside it.
 */
export const DEFAULT_CONTEXT_BUDGET = 300_000;

/**
 * Choose context for a product.
 *
 * Returns `{ strategy, text, tokensEstimated, pagesUsed, pagesOmitted, notes }`.
 * `strategy` is "bundle" or "selection" — recorded so a probe run can say what
 * the model was actually shown.
 */
export function buildContext({ resolved, pages, budget = DEFAULT_CONTEXT_BUDGET }) {
  const notes = [];

  // --- bundle, when it fits ------------------------------------------------
  const bundleText = resolved.bundle?.text;
  if (bundleText) {
    const tokens = estimateTokens(bundleText);
    if (tokens <= budget) {
      return {
        strategy: "bundle",
        text: bundleText,
        tokensEstimated: tokens,
        pagesUsed: null, // the bundle is opaque — it does not enumerate pages
        pagesOmitted: 0,
        notes: [`using ${resolved.bundle.url} (~${tokens.toLocaleString()} est. tokens)`],
      };
    }
    notes.push(
      `bundle is ~${tokens.toLocaleString()} est. tokens, over the ${budget.toLocaleString()} budget — ` +
        `falling back to page selection`,
    );
  }

  // --- selection -----------------------------------------------------------
  // Largest-first would blow the budget on one reference page; smallest-first
  // maximises how many distinct pages the model sees, which is what makes a
  // product-level probe realistic.
  const usable = pages
    .filter((p) => p.fetched && p.page?.markdown)
    .sort((a, b) => (a.bytes ?? 0) - (b.bytes ?? 0));

  const parts = [];
  const used = [];
  let total = 0;

  for (const p of usable) {
    const body = `## ${p.title ?? p.url}\nSource: ${p.finalUrl ?? p.url}\n\n${p.page.markdown}`;
    const cost = estimateTokens(body);
    if (total + cost > budget) continue; // skip, don't stop — a later page may still fit
    parts.push(body);
    used.push(p.url);
    total += cost;
  }

  if (used.length < usable.length) {
    notes.push(`${usable.length - used.length} page(s) omitted to stay inside the budget`);
  }

  return {
    strategy: "selection",
    text: parts.join("\n\n---\n\n"),
    tokensEstimated: total,
    pagesUsed: used,
    pagesOmitted: usable.length - used.length,
    notes,
  };
}
