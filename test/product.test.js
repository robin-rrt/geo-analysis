import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { linksFrom, SCOPES } from "../src/product/resolve.js";
import { rollup, CHECKS } from "../src/product/rollup.js";
import { buildContext, estimateTokens, DEFAULT_CONTEXT_BUDGET } from "../src/product/context.js";
import { hashOf, changedSince } from "../src/product/fetch.js";

// A fetched-page fixture shaped like fetchProduct() output.
const page = (url, { markdown = "# T\n\nWords here.", jsonLd = [], headHtml = null, bytes, format = "html" } = {}) => ({
  url,
  included: true,
  fetched: true,
  finalUrl: url,
  title: url,
  bytes: bytes ?? markdown.length,
  contentHash: hashOf(markdown),
  page: { markdown, jsonLd, headHtml, finalUrl: url, format },
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

test("HTML-layer checks skip markdown endpoints entirely", () => {
  // llms.txt curated indexes link .md URLs, which have no <head> by
  // construction. Counting that absence as a finding penalises a page for being
  // served in the format the site tells agents to prefer.
  const md = page("u1", { format: "markdown", markdown: "# Doc\n\nBody text here." });
  const view = rollup("p", "curated", [md]);

  for (const id of ["jsonld-valid", "canonical", "freshness", "entity-metadata", "declared-language"]) {
    const c = view.checks.find((x) => x.id === id);
    assert.equal(c.evaluatedPages, 0, `${id} must not evaluate a markdown endpoint`);
    assert.equal(c.points, null, `${id} must not contribute a score`);
  }
  // Format-agnostic checks still run.
  assert.ok(view.checks.find((c) => c.id === "heading-structure").evaluatedPages > 0);
});

test("an all-markdown product is not penalised for missing HTML metadata", () => {
  const html = rollup("p", "full", [page("h", { jsonLd: [ld({ canonical: "x" })] })]).score;
  const markdown = rollup("p", "curated", [page("m", { format: "markdown" })]).score;
  assert.ok(markdown > 0, "a markdown-only product still scores");
  assert.notEqual(markdown, null);
  void html;
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

// ------------------------------------------------- dashboard product collect --

import { collectProducts } from "../src/dashboard/products.js";
import path from "node:path";
import os from "node:os";

/** A throwaway results/products tree. */
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "geo-products-"));
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  }
  return root;
}

const ROLLUP = { product: "p", scope: "curated", score: 80, counts: { fetched: 3 }, checks: [], potentialFixes: [] };

test("collects a product from its rollup, with or without an audit", () => {
  const root = fixture({
    "products/p/rollup.json": ROLLUP,
    "products/p/pages.json": { counts: { curated: 3, sitemap: 9 }, notes: ["3 of 9"] },
  });
  try {
    const [p] = collectProducts(root);
    assert.equal(p.name, "p");
    assert.equal(p.score, 80);
    assert.equal(p.counts.sitemap, 9, "ledger counts merge into the rollup's");
    assert.equal(p.audit, null, "no audit.md is absent, not an error");
    assert.deepEqual(p.probeRuns, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("returns nothing when there is no products directory", () => {
  const root = fixture({ "somepage/audit.md": "# x" });
  try {
    assert.deepEqual(collectProducts(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("recomputes tiers for a run recorded before tiering shipped", () => {
  // The first real product run stored tier: null. The dashboard must still be
  // able to show where answers pointed rather than rendering a blank column.
  const root = fixture({
    "products/p/rollup.json": ROLLUP,
    "products/p/probes.json": {
      scope_urls: ["https://d.co/a", "https://d.co/b"],
      probes: [{ id: "p1", expected_source_urls: ["https://d.co/a"] }],
    },
    "products/p/probe-results-m-web.json": {
      model_tested: "m",
      mode: "web",
      results: [
        { probe_id: "p1", fidelity: 70, answer: "see https://d.co/b", retrieval: { cited_urls: [], tier: null } },
      ],
    },
  });
  try {
    const [p] = collectProducts(root);
    assert.equal(p.probeRuns[0].tiers["in-scope"], 1, "a sibling citation is recovered");
    assert.equal(p.probeRuns[0].tiers.recomputed, true, "and flagged as recomputed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("closed-mode runs get no tier breakdown", () => {
  const root = fixture({
    "products/p/rollup.json": ROLLUP,
    "products/p/probes.json": { scope_urls: ["https://d.co/a"], probes: [{ id: "p1", expected_source_urls: [] }] },
    "products/p/probe-results-m-closed.json": {
      model_tested: "m",
      mode: "closed",
      results: [{ probe_id: "p1", fidelity: 30, answer: "", retrieval: { cited_urls: [] } }],
    },
  });
  try {
    assert.equal(collectProducts(root)[0].probeRuns[0].tiers, null, "closed mode has no retrieval to tier");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
