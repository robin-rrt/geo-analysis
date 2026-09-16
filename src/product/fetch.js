// Fetch a resolved product's pages, politely and once.
//
// The corpus moves — docs.chain.link grew 1,394 -> 1,465 pages in six days —
// so a content hash per page is what makes re-runs cheap: unchanged pages skip
// the expensive LLM tiers entirely. The fetch itself is never skipped, because
// 0 of 906 markdown responses carry an ETag or Last-Modified (measured by the
// crawler), so there is nothing to revalidate against.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { extractPage } from "../extract.js";

const DEFAULT_CONCURRENCY = 6;

export const hashOf = (text) => crypto.createHash("sha256").update(text ?? "").digest("hex").slice(0, 16);

/** Bounded-concurrency map that never rejects: failures come back as values. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { ok: true, value: await fn(items[i], i) };
      } catch (err) {
        out[i] = { ok: false, error: err.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Fetch every in-scope page of a resolved product.
 *
 * Mutates nothing on `resolved`; returns `{ pages, counts }` where each entry
 * carries the extracted page or the reason it could not be read. A page that
 * fails to fetch stays in the ledger as a failure rather than disappearing —
 * silently shrinking the denominator is how a corpus report starts lying.
 */
export async function fetchProduct(resolved, { concurrency = DEFAULT_CONCURRENCY, onProgress } = {}) {
  const targets = resolved.pages.filter((p) => p.included);
  let done = 0;

  const results = await pool(targets, concurrency, async (entry) => {
    const page = await extractPage(entry.url);
    onProgress?.(++done, targets.length, entry.url);
    return page;
  });

  const pages = targets.map((entry, i) => {
    const r = results[i];
    if (!r.ok) {
      return { ...entry, fetched: false, error: r.error, contentHash: null, page: null };
    }
    return {
      ...entry,
      fetched: true,
      finalUrl: r.value.finalUrl,
      title: r.value.title,
      contentHash: hashOf(r.value.markdown),
      bytes: r.value.markdown.length,
      page: r.value,
    };
  });

  const fetched = pages.filter((p) => p.fetched).length;
  return {
    pages,
    counts: { attempted: targets.length, fetched, failed: targets.length - fetched },
  };
}

/**
 * Compare against the previous run's ledger so unchanged pages can skip the
 * paid tiers. Returns the subset whose content hash moved, plus a count.
 */
export function changedSince(pages, previousLedgerPath) {
  if (!previousLedgerPath || !fs.existsSync(previousLedgerPath)) {
    return { changed: pages, unchanged: 0, baseline: null };
  }
  let prior;
  try {
    prior = JSON.parse(fs.readFileSync(previousLedgerPath, "utf8"));
  } catch {
    return { changed: pages, unchanged: 0, baseline: null };
  }

  const byUrl = new Map((prior.pages ?? []).map((p) => [p.url, p.contentHash]));
  const changed = pages.filter((p) => !p.contentHash || byUrl.get(p.url) !== p.contentHash);
  return {
    changed,
    unchanged: pages.length - changed.length,
    baseline: prior.resolvedAt ?? null,
  };
}

/** Persist the ledger — the record of what was looked at and what was skipped. */
export function writeLedger(dir, resolved, fetchResult) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "pages.json");

  const ledger = {
    product: resolved.product,
    scope: resolved.scope,
    resolvedAt: resolved.resolvedAt,
    sources: resolved.sources,
    notes: resolved.notes,
    counts: { ...resolved.counts, ...fetchResult.counts },
    // `page` holds the full extracted body; keep it out of the ledger on disk.
    pages: fetchResult.pages.map(({ page, ...rest }) => rest),
  };
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n");
  return file;
}
