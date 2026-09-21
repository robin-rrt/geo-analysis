// What to run against.
//
// A target resolves a spec string into a page list plus a ledger. Everything
// downstream — audit, probes, test, rollup — consumes the same shape and knows
// nothing about which kind of target produced it.
//
// Naming note, decided deliberately: the codebase already uses `scope` to mean
// *breadth within a product* (curated | full | bundle) in resolve.js, fetch.js,
// audit.js and rollup.js. This concept is *what to run against*, so it is a
// **target**, and the curated-set prefix is `watchlist:` — reusing `scope` here
// would have made `curated` mean two different things on two different axes.

import { resolveProductTarget } from "./product.js";
import { resolveWatchlistTarget } from "./watchlist.js";
import { resolvePageTarget } from "./page.js";

export const TARGET_TYPES = ["product", "watchlist", "page"];

const RESOLVERS = {
  product: resolveProductTarget,
  watchlist: resolveWatchlistTarget,
  page: resolvePageTarget,
};

/**
 * Split `type:rest` without breaking URLs, which contain their own colon.
 * `page:https://x/y` must yield ["page", "https://x/y"], not ["page", "https"].
 */
export function parseTargetSpec(spec) {
  if (typeof spec !== "string" || !spec.trim()) {
    throw new Error(`empty target — expected one of: ${TARGET_TYPES.map((t) => `${t}:<name>`).join(", ")}`);
  }
  const i = spec.indexOf(":");
  if (i === -1) {
    throw new Error(
      `target "${spec}" has no type prefix — use ${TARGET_TYPES.map((t) => `${t}:<name>`).join(", ")}`,
    );
  }
  const type = spec.slice(0, i);
  const rest = spec.slice(i + 1);
  if (!TARGET_TYPES.includes(type)) {
    throw new Error(`unknown target type "${type}" — expected one of: ${TARGET_TYPES.join(", ")}`);
  }
  if (!rest) throw new Error(`target "${spec}" is missing a name after "${type}:"`);
  return { type, rest };
}

/**
 * Resolve a target spec into `{ type, name, productScope, pages, ledger, ... }`.
 *
 * `pages` holds only what is in scope; `ledger` holds everything considered,
 * with a reason for anything excluded, so a run can always answer "why wasn't
 * this page checked?".
 */
export async function resolveTarget(spec, options = {}) {
  const { type, rest } = parseTargetSpec(spec);
  return RESOLVERS[type](rest, options);
}

/** Shared shape builder so all three resolvers cannot drift apart. */
export function makeTarget({
  type,
  name,
  pages,
  ledger,
  productScope = null,
  origin = null,
  notes = [],
  sources = {},
  native = null,
}) {
  return {
    type,
    name,
    productScope,
    origin,
    pages,
    ledger,
    counts: { discovered: ledger.length, inScope: pages.length },
    notes,
    sources,
    // The underlying resolver result, when there is one. Carried so stages that
    // need product-specific extras (the llms-full bundle, for instance) do not
    // have to resolve a second time over the network.
    native,
  };
}
