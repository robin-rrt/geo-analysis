// Grouping primitives for the workhorse tables.
//
// Kept pure and separate from DataTable so the rules that decide "which product
// is this page?" can be tested without rendering anything.

/** Rows that cannot be placed. Always sorted last, never silently dropped. */
export const UNGROUPED = "Not yet audited";

/**
 * Which product a page belongs to.
 *
 * The index carries no product field, and adding one would be wrong: a page's
 * provenance is the run that measured it, and a page can be measured by several
 * runs with different targets (a product sweep for the audit, a watchlist for
 * the probes). The URL is the stable fact — on a docs site the first path
 * segment IS the product, and it survives re-measurement by a different target.
 */
export function productOf(page) {
  if (!page?.url) return UNGROUPED;
  let pathname;
  try {
    pathname = new URL(page.url).pathname;
  } catch {
    return UNGROUPED;
  }
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return "(site root)";
  // `/cre.md` is the markdown endpoint of `/cre`, not a second product. Keeping
  // them apart put three pages in groups of one on the real corpus.
  return seg.replace(/\.md$/, "");
}

/**
 * Which product a RUN was aimed at.
 *
 * A single-page run against /ace/... and a product sweep of `ace` belong in the
 * same bucket — otherwise the Runs view answers "what did I measure" with a
 * taxonomy that doesn't match the Pages view, and the two stop lining up.
 */
export function productOfRun(run) {
  const t = run?.target;
  if (!t?.name) return UNGROUPED;
  if (t.type === "product") return t.name;
  if (t.type === "page") return productOf({ url: t.name });
  // A watchlist is a hand-picked set that can span products, so it stays its
  // own bucket rather than being forced into one of them.
  return `${t.name} (${t.type})`;
}

/** Calendar day of an ISO timestamp, in the reader's zone. */
export function dayOf(iso) {
  if (!iso) return UNGROUPED;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? UNGROUPED : d.toLocaleDateString();
}

/**
 * Bucket rows, preserving the order they arrive in within each bucket — so the
 * table's current sort still governs inside a group.
 */
export function groupRows(rows, of) {
  const map = new Map();
  for (const row of rows) {
    const key = of(row) || UNGROUPED;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map].map(([key, groupRows]) => ({ key, rows: groupRows }));
}

/**
 * Biggest group first, ties alphabetical, unplaceable rows last.
 *
 * Size-first because the question a reader brings to a 93-row table is "where
 * is the bulk of my corpus", not "what starts with A".
 *
 * `order` overrides that for an ORDINAL grouping. Bands run Exemplary..Poor and
 * statuses run running..complete; sorting those by population puts "Good" above
 * "Strong" and reads as nonsense, because the axis is quality, not count.
 */
export function sortGroups(groups, order = null) {
  const rank = order ? new Map(order.map((k, i) => [k, i])) : null;
  return [...groups].sort((a, b) => {
    if (a.key === UNGROUPED) return 1;
    if (b.key === UNGROUPED) return -1;
    if (rank) {
      // A key the caller did not list sorts after every key it did, rather
      // than silently landing first.
      const ra = rank.has(a.key) ? rank.get(a.key) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.key) ? rank.get(b.key) : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
    } else if (a.rows.length !== b.rows.length) {
      return b.rows.length - a.rows.length;
    }
    return a.key.localeCompare(b.key);
  });
}

/** Mean of a numeric field, ignoring rows that do not carry it. */
export function meanOf(rows, get) {
  const vals = rows.map(get).filter((v) => Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
