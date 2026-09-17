import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeUrl, bodyUrls, retrievalHit } from "../src/retrieval.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://docs.chain.link/cre/guides/workflow/using-randomness";

test("normalizeUrl ignores scheme, www, trailing slash, .md twin, query, fragment", () => {
  const key = "docs.chain.link/cre/guides/workflow/using-randomness";
  for (const u of [
    SOURCE,
    "http://docs.chain.link/cre/guides/workflow/using-randomness/",
    "https://www.docs.chain.link/cre/guides/workflow/using-randomness",
    "https://docs.chain.link/cre/guides/workflow/using-randomness.md",
    "https://DOCS.chain.link/cre/guides/workflow/using-randomness?lang=go#go",
    "docs.chain.link/cre/guides/workflow/using-randomness",
  ]) {
    assert.equal(normalizeUrl(u), key, u);
  }
  assert.equal(normalizeUrl(""), null);
  assert.equal(normalizeUrl(undefined), null);
});

test("bodyUrls extracts explicit links and strips trailing punctuation", () => {
  const urls = bodyUrls(`See ${SOURCE}. Also (https://example.com/a).`);
  assert.deepEqual([...urls], [SOURCE, "https://example.com/a"]);
});

test("a cited URL matching the expected source is a citation hit", () => {
  assert.deepEqual(
    retrievalHit({ citedUrls: [`${SOURCE}.md`], answer: "", expectedUrls: [SOURCE] }),
    { hit: true, via: "citation" },
  );
});

test("a scheme-less mention in the answer text is a mention hit", () => {
  const answer = "Per the guide (`docs.chain.link/cre/guides/workflow/using-randomness`), call runtime.Rand().";
  assert.deepEqual(retrievalHit({ citedUrls: [], answer, expectedUrls: [SOURCE] }), {
    hit: true,
    via: "mention",
  });
  // Sentence-final punctuation and a trailing slash still end at the page.
  for (const tail of [".", "/", "/.", "#go", ")"]) {
    const r = retrievalHit({ answer: `see docs.chain.link/cre/guides/workflow/using-randomness${tail}`, expectedUrls: [SOURCE] });
    assert.equal(r.hit, true, tail);
  }
});

test("sibling and child pages are not hits", () => {
  for (const other of [
    "docs.chain.link/cre/guides/workflow/using-randomness-advanced",
    "docs.chain.link/cre/guides/workflow/using-randomness/go",
    "notdocs.chain.link/cre/guides/workflow/using-randomness",
  ]) {
    assert.deepEqual(
      retrievalHit({ citedUrls: [`https://${other}`], answer: other, expectedUrls: [SOURCE] }),
      { hit: false, via: null },
      other,
    );
  }
});

test("no expected URLs means no hit", () => {
  assert.deepEqual(retrievalHit({ citedUrls: [SOURCE], answer: SOURCE, expectedUrls: [] }), {
    hit: false,
    via: null,
  });
});

/** Legacy web-mode probe runs (the ones the grader judged) joined with their probe sets. */
function storedRuns() {
  const dir = path.join(root, "results");
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) =>
      fs
        .readdirSync(path.join(dir, e.name))
        .filter((f) => /^probe-results-.*\.json$/.test(f))
        .map((f) => ({
          slug: e.name,
          run: JSON.parse(fs.readFileSync(path.join(dir, e.name, f), "utf8")),
          probes: JSON.parse(fs.readFileSync(path.join(dir, e.name, "probes.json"), "utf8")).probes,
        })),
    )
    // Runs recorded since retrieval moved into code need no recomputation, and
    // closed-mode runs have no retrieval verdict to compare against.
    .filter(({ run }) => run.mode === "web" && !run.probe_set_id);
}

test("p10 regression: a scheme-less mention the old regex missed is a hit", () => {
  const { run, probes } = storedRuns().find((r) => r.slug === "workflow-using-randomness");
  const r = run.results.find((x) => x.probe_id === "p10");
  const probe = probes.find((p) => p.id === "p10");
  assert.deepEqual(
    retrievalHit({
      citedUrls: [...r.retrieval.cited_urls, ...bodyUrls(r.answer)],
      answer: r.answer,
      expectedUrls: probe.expected_source_urls,
    }),
    { hit: true, via: "mention" },
  );
});

// The grader judged identical evidence both ways: p10 (workflow-using-randomness)
// and p02 (concepts-non-determinism-go) each name the page scheme-less with no
// citation block; it called the first a hit and the second a miss. The code
// rule is consistent, so the only permitted disagreement is a mention the grader
// missed — never a hit the grader saw that code loses.
test("recomputed hits keep every stored hit; disagreements are only grader-missed mentions", () => {
  const disagreements = [];
  let n = 0;
  for (const { slug, run, probes } of storedRuns()) {
    for (const r of run.results) {
      const probe = probes.find((p) => p.id === r.probe_id);
      const { hit, via } = retrievalHit({
        citedUrls: [...r.retrieval.cited_urls, ...bodyUrls(r.answer)],
        answer: r.answer,
        expectedUrls: probe.expected_source_urls,
      });
      n++;
      if (hit === r.retrieval.hit_expected_source) continue;
      assert.equal(r.retrieval.hit_expected_source, false, `${slug} ${r.probe_id}: code lost a stored hit`);
      assert.equal(via, "mention", `${slug} ${r.probe_id}`);
      disagreements.push(`${slug} ${r.probe_id}`);
    }
  }
  assert.ok(n >= 20, `expected the stored probe runs, found ${n} results`);
  assert.deepEqual(disagreements, ["concepts-non-determinism-go p02"]);
});

// ---------------------------------------------------- tiered (product scope) --

import { retrievalTier } from "../src/retrieval.js";

const PRODUCT = [
  "https://docs.chain.link/vrf/v2-5/overview/subscription",
  "https://docs.chain.link/vrf/v2-5/billing",
  "https://docs.chain.link/vrf/v2-5/security",
];
const EXPECTED = ["https://docs.chain.link/vrf/v2-5/billing"];

const tierOf = (answer, citedUrls = []) =>
  retrievalTier({ citedUrls, answer, expectedUrls: EXPECTED, scopeUrls: PRODUCT }).tier;

test("exact beats in-scope when the expected page is cited", () => {
  assert.equal(tierOf("", ["https://docs.chain.link/vrf/v2-5/billing"]), "exact");
});

test("a sibling page inside the product is in-scope, not a miss", () => {
  // The case page-scoped probing scores as a miss: a different page of the same
  // product that legitimately answers the question.
  assert.equal(tierOf("", ["https://docs.chain.link/vrf/v2-5/security"]), "in-scope");
});

test("citing only outside the product is out-of-scope", () => {
  assert.equal(tierOf("", ["https://ethereum.org/en/developers"]), "out-of-scope");
});

test("citing nothing is none, not a miss on someone else's page", () => {
  assert.equal(tierOf("Use Chainlink VRF for randomness.", []), "none");
});

test("in-text mentions are tiered the same as citations", () => {
  assert.equal(tierOf("see docs.chain.link/vrf/v2-5/security for details"), "in-scope");
  assert.equal(tierOf("see docs.chain.link/vrf/v2-5/billing for details"), "exact");
});

test("hit stays true only for exact, so old aggregates keep their meaning", () => {
  const exact = retrievalTier({ citedUrls: EXPECTED, expectedUrls: EXPECTED, scopeUrls: PRODUCT });
  const sibling = retrievalTier({
    citedUrls: ["https://docs.chain.link/vrf/v2-5/security"],
    expectedUrls: EXPECTED,
    scopeUrls: PRODUCT,
  });
  assert.equal(exact.hit, true);
  assert.equal(sibling.hit, false, "an in-scope sibling must not inflate the strict hit rate");
  assert.equal(sibling.inScope, true, "but it is recorded as in-scope");
});

test("the expected page is never double-counted as a sibling", () => {
  // scopeUrls contains the expected page; a near-miss must not resurface as in-scope.
  const r = retrievalTier({
    citedUrls: ["https://docs.chain.link/vrf/v2-5/billing-old"],
    expectedUrls: EXPECTED,
    scopeUrls: [...PRODUCT, ...EXPECTED],
  });
  assert.equal(r.tier, "out-of-scope");
});

test("falls back gracefully when no product scope is supplied", () => {
  const r = retrievalTier({ citedUrls: EXPECTED, expectedUrls: EXPECTED });
  assert.equal(r.tier, "exact", "page-scoped callers still work with no scopeUrls");
});
