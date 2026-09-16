import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { linksFrom, SCOPES } from "../src/product/resolve.js";
import { rollup, CHECKS } from "../src/product/rollup.js";
import { buildContext, estimateTokens, DEFAULT_CONTEXT_BUDGET } from "../src/product/context.js";
import { hashOf, changedSince } from "../src/product/fetch.js";

// A fetched-page fixture shaped like fetchProduct() output.
const page = (url, { markdown = "# T\n\nWords here.", jsonLd = [], headHtml = null, bytes } = {}) => ({
  url,
  included: true,
  fetched: true,
  finalUrl: url,
  title: url,
  bytes: bytes ?? markdown.length,
  contentHash: hashOf(markdown),
  page: { markdown, jsonLd, headHtml, finalUrl: url },
});

const ld = (o) => JSON.stringify({ "@type": "TechArticle", ...o });

// --------------------------------------------------------------- resolve ----

test("extracts links from an llms.txt index, resolving relative hrefs", () => {
  const text = "- [A](/vrf/a.md)\n- [B](https://docs.chain.link/vrf/b.md)\n- [bad](ht tp://x)";
  const links = linksFrom(text, "https://docs.chain.link/vrf/llms.txt");
  assert.ok(links.includes("https://docs.chain.link/vrf/a.md"));
  assert.ok(links.includes("https://docs.chain.link/vrf/b.md"));
  assert.equal(links.length, 2, "the whitespace-bearing href is skipped, not fatal");
});

test("exposes exactly the three documented scopes", () => {
  assert.deepEqual(SCOPES, ["curated", "full", "bundle"]);
});

// ---------------------------------------------------------------- rollup ----

test("a check that cannot assess a page excludes it from its own denominator", () => {
  // One page declares a language with code; one has neither.
  const pages = [
    page("u1", { markdown: "```ts\nconst a=1;\n```", jsonLd: [ld({ programmingLanguage: "Rust" })] }),
    page("u2", { markdown: "Just prose, no code." }),
  ];
  const view = rollup("p", "curated", pages);
  const check = view.checks.find((c) => c.id === "declared-language");

  assert.equal(check.evaluatedPages, 1, "only the page with both a declaration and code counts");
  assert.equal(check.notApplicable, 1);
  assert.equal(check.fail, 1);
  assert.equal(check.points, 0, "the unassessable page must not dilute the failure");
});

test("scores warn as half credit", () => {
  const pages = [
    page("u1", { jsonLd: [ld({ keywords: "and, from", about: [] })] }), // stopwords -> warn
    page("u2", { jsonLd: [ld({ keywords: "Chainlink, VRF", about: [] })] }), // clean -> pass
  ];
  const check = rollup("p", "curated", pages).checks.find((c) => c.id === "entity-metadata");
  assert.equal(check.warn, 1);
  assert.equal(check.pass, 1);
  assert.equal(check.points, 0.75, "(1 pass + 0.5 warn) / 2");
});

test("unfetched pages are counted but never scored", () => {
  const pages = [page("u1"), { url: "u2", included: true, fetched: false, error: "404", page: null }];
  const view = rollup("p", "curated", pages);
  assert.equal(view.counts.inScope, 2);
  assert.equal(view.counts.fetched, 1);
  assert.equal(view.counts.unfetched, 1);
  for (const c of view.checks) {
    assert.ok(c.evaluatedPages <= 1, `${c.id} must not evaluate an unfetched page`);
  }
});

test("ranks potential fixes by recoverable points, not by page count", () => {
  // declared-language (weight 10) fails on 1 page; freshness (weight 3) warns on many.
  const many = Array.from({ length: 8 }, (_, i) =>
    page(`f${i}`, { jsonLd: [ld({ datePublished: "2026-01-01", dateModified: "2026-01-01" })] }),
  );
  const heavy = page("h", { markdown: "```go\nx\n```", jsonLd: [ld({ programmingLanguage: "Rust" })] });
  const view = rollup("p", "curated", [...many, heavy]);

  const ids = view.potentialFixes.map((f) => f.id);
  assert.ok(
    ids.indexOf("declared-language") < ids.indexOf("freshness"),
    "a heavy check failing once must outrank a light check warning eight times",
  );
});

test("every check declares a weight and a description", () => {
  for (const c of CHECKS) {
    assert.ok(c.weight > 0, `${c.id} needs a weight`);
    assert.ok(c.describe, `${c.id} needs a description`);
  }
});

// --------------------------------------------------------------- context ----

test("uses the bundle when it fits the budget", () => {
  const resolved = { bundle: { url: "b", text: "x".repeat(1000) } };
  const ctx = buildContext({ resolved, pages: [], budget: DEFAULT_CONTEXT_BUDGET });
  assert.equal(ctx.strategy, "bundle");
  assert.equal(ctx.pagesOmitted, 0);
});

test("falls back to page selection when the bundle is over budget", () => {
  // Stands in for CCIP, whose real bundle is ~1.16M tokens — over the 1M window.
  const resolved = { bundle: { url: "b", text: "x".repeat(5_000_000) } };
  const pages = [page("u1", { markdown: "short" }), page("u2", { markdown: "also short" })];
  const ctx = buildContext({ resolved, pages, budget: 1000 });

  assert.equal(ctx.strategy, "selection");
  assert.equal(ctx.pagesUsed.length, 2);
  assert.match(ctx.notes.join(" "), /over the .* budget/);
});

test("selection skips oversized pages rather than stopping at the first one", () => {
  const pages = [
    page("big", { markdown: "x".repeat(40_000) }),
    page("small", { markdown: "fits" }),
  ];
  // Budget admits `small` but not `big`; sorted smallest-first, both are considered.
  const ctx = buildContext({ resolved: {}, pages, budget: estimateTokens("fits") + 50 });
  assert.deepEqual(ctx.pagesUsed, ["small"]);
  assert.equal(ctx.pagesOmitted, 1);
});

// ----------------------------------------------------------------- fetch ----

test("content hash identifies changed pages against a prior ledger", () => {
  const file = fileURLToPath(new URL("./.tmp-ledger.json", import.meta.url));
  const unchangedBody = "# T\n\nWords here."; // matches the default fixture body
  fs.writeFileSync(
    file,
    JSON.stringify({
      resolvedAt: "2026-09-10T00:00:00Z",
      pages: [
        { url: "u1", contentHash: hashOf("old") },
        { url: "u2", contentHash: hashOf(unchangedBody) },
      ],
    }),
  );

  try {
    const delta = changedSince([page("u1", { markdown: "new content" }), page("u2")], file);
    assert.deepEqual(delta.changed.map((p) => p.url), ["u1"], "only the edited page re-runs");
    assert.equal(delta.unchanged, 1, "an unchanged page skips the paid tiers");
    assert.equal(delta.baseline, "2026-09-10T00:00:00Z");
  } finally {
    fs.unlinkSync(file);
  }
});

test("treats every page as changed when there is no prior ledger", () => {
  const pages = [page("u1"), page("u2")];
  const delta = changedSince(pages, "/nonexistent/pages.json");
  assert.equal(delta.changed.length, 2);
  assert.equal(delta.baseline, null);
});
