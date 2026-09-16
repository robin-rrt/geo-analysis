// Resolve a product name to the set of pages that constitute it.
//
// No crawler is needed: docs sites following the llms.txt convention publish
// their own product taxonomy. docs.chain.link exposes a curated index at
// /{product}/llms.txt, a full-text bundle at /{product}/llms-full.txt, and a
// sitemap for complete coverage. Resolution reads those rather than spidering.
//
// Every decision is recorded in a ledger. A page that was discovered and then
// excluded says why, so a report can never quietly narrow its own denominator.

const USER_AGENT = "geo-analyze/0.1 (+https://github.com/robin/geo-analysis; GEO audit bot)";

export const SCOPES = ["curated", "full", "bundle"];

/** Exclusions that are not pages at all — indexes and machine endpoints. */
const NON_PAGE = /\/(llms\.txt|llms-full\.txt|search-index|sitemap[^/]*\.xml)$/i;

async function get(url, { timeout = 30_000 } = {}) {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/plain,text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  return { ok: res.ok, status: res.status, url: res.url, text: res.ok ? await res.text() : "" };
}

/** Absolute URLs from markdown links in an llms.txt index. */
export function linksFrom(text, base) {
  const out = [];
  for (const [, href] of text.matchAll(/\]\((\S+?)\)/g)) {
    try {
      out.push(new URL(href, base).toString());
    } catch {
      // A malformed href is a finding for the crawler tier, not a crash here.
    }
  }
  return out;
}

/** `<loc>` entries from a sitemap, following a sitemap index one level. */
export async function sitemapUrls(origin) {
  const locs = (text) => [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

  for (const candidate of ["sitemap.xml", "sitemap-index.xml", "sitemap_index.xml"]) {
    const res = await get(new URL(`/${candidate}`, origin).toString());
    if (!res.ok) continue;

    const found = locs(res.text);
    // A sitemap index points at sitemaps; a sitemap points at pages.
    if (/<sitemapindex/i.test(res.text)) {
      const all = [];
      for (const child of found) {
        const sub = await get(child);
        if (sub.ok) all.push(...locs(sub.text));
      }
      if (all.length) return all;
    }
    if (found.length) return found;
  }
  return [];
}

const normalise = (u) => u.replace(/\/+$/, "").replace(/#.*$/, "");

/**
 * Resolve a product to its page set.
 *
 * Returns `{ product, scope, sources, counts, pages, bundle, notes }` where
 * `pages` is the ledger: every page discovered, whether it is in scope, and why
 * not when it isn't.
 */
export async function resolveProduct(product, { scope = "curated", origin = "https://docs.chain.link" } = {}) {
  if (!SCOPES.includes(scope)) {
    throw new Error(`unknown scope "${scope}" — use one of: ${SCOPES.join(", ")}`);
  }

  const prefix = `${normalise(origin)}/${product}/`;
  const indexUrl = `${prefix}llms.txt`;
  const bundleUrl = `${prefix}llms-full.txt`;
  const notes = [];

  // --- curated index -------------------------------------------------------
  const index = await get(indexUrl);
  const curated = new Set();
  if (index.ok) {
    for (const u of linksFrom(index.text, indexUrl)) {
      if (!NON_PAGE.test(u) && normalise(u).startsWith(normalise(prefix))) curated.add(normalise(u));
    }
  } else {
    notes.push(`no curated index at ${indexUrl} (HTTP ${index.status})`);
  }

  // --- sitemap, filtered to this product ----------------------------------
  const all = await sitemapUrls(origin);
  const sitemap = new Set(
    all.map(normalise).filter((u) => u.startsWith(normalise(prefix)) && !NON_PAGE.test(u)),
  );
  if (!all.length) notes.push("sitemap unavailable — `full` scope cannot be resolved");

  // --- bundle --------------------------------------------------------------
  let bundle = null;
  if (scope === "bundle") {
    const b = await get(bundleUrl, { timeout: 120_000 });
    bundle = b.ok
      ? { url: bundleUrl, bytes: b.text.length, text: b.text }
      : { url: bundleUrl, bytes: 0, text: null, status: b.status };
    if (!b.ok) notes.push(`bundle unavailable (HTTP ${b.status}) — falling back to curated pages`);
  }

  // --- ledger --------------------------------------------------------------
  const discovered = new Set([...curated, ...sitemap]);
  const inScope = (url) => {
    if (scope === "full") return sitemap.has(url);
    // curated and bundle scopes both audit the curated page set; bundle only
    // changes how probe context is assembled, not which pages are assessed.
    return curated.has(url);
  };

  const pages = [...discovered].sort().map((url) => {
    const source = curated.has(url) ? (sitemap.has(url) ? "both" : "llms.txt") : "sitemap";
    const included = inScope(url);
    return {
      url,
      source,
      included,
      ...(included ? {} : { reason: scope === "full" ? "not-in-sitemap" : "not-in-curated-index" }),
    };
  });

  const includedCount = pages.filter((p) => p.included).length;

  // The gap between what the site recommends and what it publishes is a
  // finding in its own right, not bookkeeping.
  if (curated.size && sitemap.size && curated.size < sitemap.size) {
    notes.push(
      `curated index lists ${curated.size} of ${sitemap.size} pages under /${product}/ — ` +
        `${sitemap.size - curated.size} are reachable only by luck`,
    );
  }

  return {
    product,
    scope,
    resolvedAt: new Date().toISOString(),
    sources: { index: indexUrl, bundle: bundleUrl, sitemapPrefix: prefix },
    counts: {
      discovered: discovered.size,
      curated: curated.size,
      sitemap: sitemap.size,
      inScope: includedCount,
      excluded: discovered.size - includedCount,
    },
    bundle,
    notes,
    pages,
  };
}

/** Product names advertised by the site's root llms.txt, for discovery/validation. */
export async function listProducts(origin = "https://docs.chain.link") {
  const res = await get(new URL("/llms.txt", origin).toString());
  if (!res.ok) return [];
  const names = new Set();
  for (const u of linksFrom(res.text, origin)) {
    const m = u.match(/^https?:\/\/[^/]+\/([^/]+)\/llms(?:-full)?\.txt$/);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}
