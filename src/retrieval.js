// Retrieval signal, computed deterministically: did the model-under-test point
// at the page we expected? This is a string match, so it lives in code rather
// than in the grader — an LLM deciding it costs output tokens and adds variance.

/**
 * Comparable form of a URL: host (lowercased, no "www.") + path (no trailing
 * slash, no ".md" twin); scheme, query, and fragment dropped. Scheme-less input
 * ("docs.chain.link/cre/...") is accepted. Returns null for anything unparseable.
 */
export function normalizeUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const input = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
  let u;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "").replace(/\.md$/i, "").toLowerCase();
  return host + path;
}

// Inline links in the answer body count as attribution: models often link the
// source in prose/markdown without emitting an API citation block, and
// counting only block citations under-reports retrieval hits.
export function bodyUrls(text) {
  const urls = new Set();
  for (const raw of text.match(/https?:\/\/[^\s)\]}"'`<>]+/g) ?? []) {
    urls.add(raw.replace(/[.,;:!?]+$/, ""));
  }
  return urls;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when the answer text names the expected page, with or without a scheme
 * — e.g. `docs.chain.link/cre/guides/workflow/using-randomness` in backticks.
 * The match must end at the page itself: a sibling (".../using-randomness-v2")
 * or a child (".../using-randomness/advanced") is a different page.
 */
function mentions(answer, key) {
  const slash = key.indexOf("/");
  const host = slash === -1 ? key : key.slice(0, slash);
  const path = slash === -1 ? "" : key.slice(slash);
  const pattern = new RegExp(
    `(?<![\\w.-])(?:https?://)?(?:www\\.)?${escapeRegExp(host)}${escapeRegExp(path)}(?:\\.md)?(?!/?[\\w-])`,
    "i",
  );
  return pattern.test(answer);
}

/**
 * Did the answer retrieve the expected source? A hit is a cited URL that
 * normalizes to an expected one ("citation"), or failing that, the expected URL
 * named in the answer text ("mention"). `citedUrls` should already include
 * links from the answer body (see bodyUrls).
 */
export function retrievalHit({ citedUrls = [], answer = "", expectedUrls = [] }) {
  const expected = new Set(expectedUrls.map(normalizeUrl).filter(Boolean));
  if (!expected.size) return { hit: false, via: null };
  if (citedUrls.some((u) => expected.has(normalizeUrl(u)))) return { hit: true, via: "citation" };
  for (const key of expected) {
    if (mentions(answer, key)) return { hit: true, via: "mention" };
  }
  return { hit: false, via: null };
}

/** Did the answer point at any of `urls`? Same citation-then-mention order as above. */
function matchAny(citedUrls, answer, urls) {
  const set = new Set(urls.map(normalizeUrl).filter(Boolean));
  if (!set.size) return null;
  if (citedUrls.some((u) => set.has(normalizeUrl(u)))) return "citation";
  for (const key of set) if (mentions(answer, key)) return "mention";
  return null;
}

/**
 * Retrieval outcome at product scope, as a tier rather than a boolean.
 *
 * A page-scoped probe asks "did it cite exactly this page?", which scores a
 * model that cited a sibling page answering the same question as a miss. At
 * product scope the useful question is whether the model found the right
 * *documentation*, so the verdict is graded:
 *
 *   exact         cited the page the answer key was drawn from
 *   in-scope      cited a different page inside the product that supports it
 *   out-of-scope  cited something, but nothing belonging to this product
 *   none          cited nothing at all
 *
 * `hit` stays true only for `exact`, so existing runs and aggregates keep
 * comparing like with like. Treating `exact + in-scope` as the headline rate is
 * a correction to an over-strict definition, not an improvement in the docs —
 * report both.
 */
export function retrievalTier({ citedUrls = [], answer = "", expectedUrls = [], scopeUrls = [] }) {
  const exact = matchAny(citedUrls, answer, expectedUrls);
  if (exact) return { tier: "exact", hit: true, inScope: true, via: exact };

  // Expected pages are part of the product; exclude them so a near-miss on the
  // expected page cannot be re-counted as an in-scope hit.
  const expectedKeys = new Set(expectedUrls.map(normalizeUrl).filter(Boolean));
  const siblings = scopeUrls.filter((u) => !expectedKeys.has(normalizeUrl(u)));
  const sibling = matchAny(citedUrls, answer, siblings);
  if (sibling) return { tier: "in-scope", hit: false, inScope: true, via: sibling };

  const citedAnything = citedUrls.some((u) => normalizeUrl(u)) || /https?:\/\/\S+/.test(answer);
  return citedAnything
    ? { tier: "out-of-scope", hit: false, inScope: false, via: null }
    : { tier: "none", hit: false, inScope: false, via: null };
}
