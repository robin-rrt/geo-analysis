// Product-scoped probe generation.
//
// The output is a normal probes.json, so `geo-audit probe` runs it unchanged —
// resume, grading, and the probe x model matrix all work as they do for a page.
// What differs is what went in: the context spans the product, `expected_source_urls`
// may list several pages, and `scope_urls` records the product's page set so the
// runner can grade retrieval as a tier instead of an exact-URL boolean.

import { runClaude } from "../claude.js";
import { PROBES_SCHEMA } from "../probes.js";
import { sourceHash, probeSetId } from "../probe-set.js";
import { buildContext } from "./context.js";

/**
 * Generate probes for a product.
 *
 * `resolved` and `pages` come from resolveProduct()/fetchProduct(); `view` is
 * the rollup, used only to tell the generator which pages exist.
 */
export async function genProductProbes({
  resolved,
  pages,
  n,
  model,
  effort,
  fallback = true,
  budget,
  tally,
}) {
  const context = buildContext({ resolved, pages, budget });
  if (!context.text.trim()) {
    throw new Error(
      `no usable content for ${resolved.product} — ${pages.filter((p) => p.fetched).length} page(s) fetched`,
    );
  }

  // Only pages the generator can actually see may be cited in an answer key.
  const visible = context.pagesUsed
    ? pages.filter((p) => context.pagesUsed.includes(p.url))
    : pages.filter((p) => p.fetched);

  const userContent = [
    `Product: ${resolved.product}`,
    `Scope: ${resolved.scope} — ${visible.length} page(s) supplied${
      context.strategy === "bundle" ? " (as a full-product bundle)" : ""
    }`,
    `N: ${n}`,
    ``,
    `Pages available to cite in expected_source_urls (use these URLs verbatim):`,
    ...(context.pagesUsed ?? visible.map((p) => p.finalUrl ?? p.url)).map((u) => `- ${u}`),
    ``,
    `Documentation:`,
    ``,
    context.text,
  ].join("\n");

  const probes = await runClaude({
    promptFile: "product-probes.md",
    userContent,
    model,
    effort,
    fallback,
    jsonSchema: PROBES_SCHEMA,
    tally,
    tallyLabel: "gen-product-probes",
  });

  // Shape it as a normal probe set, plus the product fields the runner uses.
  probes.source_url = resolved.sources.index;
  probes.source_title = `${resolved.product} (${resolved.scope})`;
  probes.source_content = context.text;
  probes.source_hash = sourceHash(context.text);
  probes.probe_set_id = probeSetId(probes.probes);

  probes.product = resolved.product;
  probes.scope = resolved.scope;
  probes.context_strategy = context.strategy;
  probes.context_tokens_estimated = context.tokensEstimated;
  // Every page of the product, so an in-scope citation is recognised even when
  // the generator did not draw on that page for this answer.
  probes.scope_urls = pages.filter((p) => p.fetched).map((p) => p.finalUrl ?? p.url);
  probes.context_notes = context.notes;

  return { probes, context };
}
