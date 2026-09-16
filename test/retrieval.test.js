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
