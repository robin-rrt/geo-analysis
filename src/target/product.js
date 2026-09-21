// Product target — a thin wrapper over the existing product resolver.
//
// Deliberately thin: resolveProduct() already does llms.txt + sitemap discovery,
// scope handling and ledger construction. This maps its result onto the shared
// target shape and adds nothing.

import { resolveProduct, SCOPES } from "../product/resolve.js";
import { makeTarget } from "./index.js";

export async function resolveProductTarget(name, { productScope = "curated", origin = "https://docs.chain.link" } = {}) {
  if (!SCOPES.includes(productScope)) {
    throw new Error(`unknown product scope "${productScope}" — use one of: ${SCOPES.join(", ")}`);
  }
  const resolved = await resolveProduct(name, { scope: productScope, origin });

  return makeTarget({
    type: "product",
    name,
    productScope,
    origin,
    // resolveProduct's ledger already carries `included` and a `reason`.
    pages: resolved.pages.filter((p) => p.included).map((p) => ({ url: p.url, source: p.source })),
    ledger: resolved.pages,
    notes: resolved.notes,
    sources: resolved.sources,
    native: resolved,
  });
}
