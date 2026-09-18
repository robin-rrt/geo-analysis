import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVAL_SCHEMA,
  fidelityFromScores,
  summarizeResults,
  emptyUsage,
  addUsage,
  planResume,
  graderPromptSha,
} from "../src/evaluate.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function storedResults() {
  const dir = path.join(root, "results");
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) =>
      fs
        .readdirSync(path.join(dir, e.name))
        .filter((f) => /^probe-results-.*\.json$/.test(f))
        .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, e.name, f), "utf8")).results),
    );
}

test("code-computed fidelity equals every stored grader fidelity", () => {
  const results = storedResults();
  assert.ok(results.length >= 20);
  for (const r of results) assert.equal(fidelityFromScores(r.scores), r.fidelity, r.probe_id);
});

test("grader schema asks only for content judgments", () => {
  const keys = Object.keys(EVAL_SCHEMA.properties);
  for (const gone of ["retrieval", "fidelity", "probe_id", "model_tested"]) {
    assert.ok(!keys.includes(gone), `${gone} must be computed by the harness, not the grader`);
  }
  // Structured outputs require every property to be listed as required.
  assert.deepEqual([...EVAL_SCHEMA.required].sort(), [...keys].sort());
});

const usage = (input, output) => ({ input_tokens: input, output_tokens: output });

function row({ fidelity = 70, hit = true, via = "citation", stop = "end_turn", degraded = false }) {
  return {
    fidelity,
    scores: fidelity === null ? null : { accuracy: 7, hallucination_free: 7, relevance: 7, structure: 7 },
    retrieval: { hit_expected_source: hit, via: hit ? via : null },
    stop,
    harness: { search_degraded: degraded, live_search_failed: false },
    usage: { model_under_test: usage(100, 10), grader: usage(50, 5) },
  };
}

test("summary leaves refusals out of score averages and degraded misses out of effective hit rate", () => {
  const s = summarizeResults([
    row({ fidelity: 80, hit: true }),
    row({ fidelity: 40, hit: false, degraded: true }),
    row({ fidelity: 60, hit: true, via: "mention" }),
    row({ fidelity: null, hit: false, stop: "refusal" }),
  ]);
  assert.equal(s.probe_count, 4);
  assert.equal(s.graded_count, 3);
  assert.equal(s.refusal_count, 1);
  assert.equal(s.avg_fidelity, 60);
  assert.equal(s.retrieval_hit_rate, 0.5); // 2 of 4
  assert.equal(s.retrieval_hit_rate_effective, 0.67); // 2 of 3 — degraded miss excluded
  assert.equal(s.retrieval_mention_hit_count, 1);
  assert.equal(s.inconclusive_miss_count, 1);
  assert.equal(s.usage.model_under_test.input_tokens, 400);
  assert.equal(s.usage.grader.output_tokens, 20);
});

test("closed mode has no hit rate rather than a zero one", () => {
  const s = summarizeResults([row({ hit: null }), row({ hit: null })]);
  assert.equal(s.retrieval_hit_rate, null);
  assert.equal(s.retrieval_hit_rate_effective, null);
  assert.equal(s.avg_fidelity, 70);
});

test("an all-refused run has no averages", () => {
  const s = summarizeResults([row({ fidelity: null, hit: false, stop: "refusal" })]);
  assert.equal(s.avg_fidelity, null);
  assert.equal(s.avg_scores, null);
});

test("addUsage folds raw API usage, including server-tool search counts", () => {
  const total = emptyUsage();
  addUsage(total, { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 5, server_tool_use: { web_search_requests: 3 } });
  addUsage(total, undefined);
  addUsage(total, { input_tokens: 1, output_tokens: 1 });
  assert.deepEqual(total, {
    input_tokens: 11,
    output_tokens: 3,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 5,
    web_search_requests: 3,
    service_tier: null,
  });
});

test("addUsage carries the service tier so batched tokens can be costed correctly", () => {
  const total = emptyUsage();
  addUsage(total, { input_tokens: 10, service_tier: "batch" });
  addUsage(total, { input_tokens: 5 });
  assert.equal(total.service_tier, "batch", "a later untiered entry must not clear it");
});

const identity = {
  probe_set_id: "a41be07c19d2",
  model_tested: "claude-opus-4-8",
  mode: "web",
  grader_model: "claude-opus-4-8",
  grader_effort: "high",
  grader_prompt_sha: "0123456789ab",
};
const setProbes = [{ id: "p01" }, { id: "p02" }, { id: "p03" }];

test("resume keeps finished results and retries errored ones", () => {
  const previous = {
    ...identity,
    results: [
      { probe_id: "p01", stop: "end_turn" },
      { probe_id: "p02", stop: "error" },
    ],
  };
  const { done, todo, reason } = planResume(previous, identity, setProbes);
  assert.deepEqual([...done.keys()], ["p01"]);
  assert.deepEqual(todo.map((p) => p.id), ["p02", "p03"]);
  assert.equal(reason, null);
});

test("resume refuses a run that isn't comparable, and says why", () => {
  const results = [{ probe_id: "p01", stop: "end_turn" }];
  for (const key of Object.keys(identity)) {
    const { done, todo, reason } = planResume({ ...identity, [key]: "other", results }, identity, setProbes);
    assert.equal(done.size, 0, key);
    assert.equal(todo.length, 3, key);
    assert.ok(reason, key);
  }
  const legacy = { model_tested: "claude-opus-4-8", mode: "web", results };
  assert.equal(planResume(legacy, identity, setProbes).reason, "it predates resumable runs");
  assert.deepEqual(planResume(null, identity, setProbes).reason, null);
});

test("grader prompt sha is a stable 12-hex version", () => {
  assert.match(graderPromptSha(), /^[0-9a-f]{12}$/);
  assert.equal(graderPromptSha(), graderPromptSha());
});

// ------------------------------------------------- retrieval decision seam --

import { decideRetrieval } from "../src/evaluate.js";

const SCOPE = ["https://d.co/a", "https://d.co/b", "https://d.co/c"];

test("tiers the verdict when a product scope is supplied", () => {
  const r = decideRetrieval({ citedUrls: ["https://d.co/b"], expectedUrls: ["https://d.co/a"], scopeUrls: SCOPE });
  assert.equal(r.tier, "in-scope");
  assert.equal(r.hit, false, "an in-scope sibling is not an exact hit");
});

test("falls back to exact-match with no scope, and reports a null tier", () => {
  // Regression: the tier field shipped as null on a real product run because the
  // call site never forwarded scopeUrls. The seam makes that state observable.
  const r = decideRetrieval({ citedUrls: ["https://d.co/a"], expectedUrls: ["https://d.co/a"] });
  assert.equal(r.hit, true);
  assert.equal(r.tier, null, "no scope means no tier — not a silently wrong tier");
});

test("an empty scope array behaves as no scope", () => {
  assert.equal(decideRetrieval({ citedUrls: [], expectedUrls: ["https://d.co/a"], scopeUrls: [] }).tier, null);
});
