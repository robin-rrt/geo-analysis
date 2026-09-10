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
  });
});
