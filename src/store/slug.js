// Page keys for a global namespace.
//
// The existing `slugFromUrl` (src/probes.js) keeps the last two path segments,
// which is fine for a per-product directory but collides in a flat namespace:
//
//   /ccip/getting-started/evm  ->  getting-started-evm
//   /vrf/getting-started/evm   ->  getting-started-evm   <- same key
//   /ccip/guides/overview      ->  guides-overview
//   /cre/guides/overview       ->  guides-overview       <- same key
//
// Both collisions are real on docs.chain.link today. In `dashboard/pages/<key>.json`
// that silently serves one product's page as another's, so the store keys on the
// full path and refuses to project a collision rather than overwriting.

/** Full-path key: every path segment, not just the last two. */
export function pageKey(url) {
  const u = new URL(url);
  const segments = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const base = segments.length ? segments.join("-") : u.hostname;
  return base
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/**
 * Assert that a set of URLs produces distinct keys.
 *
 * Failing loudly is the whole point: a silent overwrite looks like a page that
 * simply has the wrong content, which is far harder to diagnose than a crash.
 */
export function assertUniqueKeys(urls) {
  const byKey = new Map();
  for (const url of urls) {
    const key = pageKey(url);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(url);
  }
  const collisions = [...byKey.entries()].filter(([, us]) => us.length > 1);
  if (collisions.length) {
    const detail = collisions
      .map(([key, us]) => `  "${key}":\n${us.map((u) => `    ${u}`).join("\n")}`)
      .join("\n");
    throw new Error(`page key collision — refusing to overwrite:\n${detail}`);
  }
  return byKey;
}
