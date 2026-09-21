// Watchlist target — a curated set of pages checked routinely.
//
// The cheap half of the target abstraction: it produces the same shape as a
// product, so audit, probes, rollup, history and UI need no knowledge of it.

import fs from "node:fs";
import path from "node:path";
import { makeTarget } from "./index.js";

export const WATCHLIST_DIR = "watchlists";
export const SUPPORTED_VERSIONS = [1];

/**
 * Validate a watchlist document. Returns `{ pages, ledger }`.
 *
 * Validation is strict about things that are silently wrong later: a duplicate
 * URL would double-count in every aggregate, and an off-origin URL is a mistake
 * rather than a feature. A URL that simply 404s is *not* rejected here — that
 * belongs in the ledger with a reason, which the fetch stage records.
 */
export function validateWatchlist(doc, { source = "watchlist", origin = null } = {}) {
  if (!doc || typeof doc !== "object") throw new Error(`${source}: not a JSON object`);
  if (!SUPPORTED_VERSIONS.includes(doc.version)) {
    throw new Error(
      `${source}: unsupported version ${JSON.stringify(doc.version)} — supported: ${SUPPORTED_VERSIONS.join(", ")}`,
    );
  }
  if (!doc.name || typeof doc.name !== "string") throw new Error(`${source}: missing "name"`);
  if (!Array.isArray(doc.pages) || !doc.pages.length) {
    throw new Error(`${source}: "pages" must be a non-empty array`);
  }

  const expectedOrigin = origin ? new URL(origin).origin : null;
  const seen = new Set();
  const pages = [];
  for (const entry of doc.pages) {
    if (typeof entry !== "string") throw new Error(`${source}: every page must be a URL string`);
    let parsed;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error(`${source}: "${entry}" is not a valid URL`);
    }
    if (seen.has(parsed.href)) throw new Error(`${source}: duplicate URL "${entry}"`);
    if (expectedOrigin && parsed.origin !== expectedOrigin) {
      throw new Error(
        `${source}: "${entry}" is not on ${expectedOrigin} — a watchlist pointing off-origin is a mistake, not a feature`,
      );
    }
    seen.add(parsed.href);
    pages.push({ url: entry, source: "watchlist" });
  }

  return { pages, ledger: pages.map((p) => ({ ...p, included: true })) };
}

export function watchlistPath(name, dir = WATCHLIST_DIR) {
  return path.join(dir, `${name}.json`);
}

export function resolveWatchlistTarget(name, { origin = "https://docs.chain.link", watchlistDir = WATCHLIST_DIR } = {}) {
  const file = watchlistPath(name, watchlistDir);
  if (!fs.existsSync(file)) {
    const available = fs.existsSync(watchlistDir)
      ? fs.readdirSync(watchlistDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
      : [];
    throw new Error(
      `no watchlist "${name}" at ${file}` + (available.length ? ` — available: ${available.join(", ")}` : ""),
    );
  }
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`${file}: invalid JSON — ${err.message}`);
  }
  const { pages, ledger } = validateWatchlist(doc, { source: file, origin });

  return makeTarget({
    type: "watchlist",
    name,
    origin,
    pages,
    ledger,
    notes: doc.description ? [doc.description] : [],
    sources: { watchlist: file },
  });
}
