import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, parseJsonEntry } from "../src/batch.js";

const req = (over = {}) =>
  buildRequest({
    customId: "p01",
    promptFile: "probe-eval.md",
    userContent: [{ type: "text", text: "x" }],
    model: "claude-opus-4-8",
    effort: "high",
    jsonSchema: { type: "object" },
    ...over,
  });

test("a batch request never carries fallbacks — the API rejects them", () => {
  const r = req();
  assert.ok(!("fallbacks" in r.params), "fallbacks would 400 the whole batch");
  assert.ok(!("betas" in r.params));
});

test("a batch request is non-streaming", () => {
  assert.ok(!("stream" in req().params), "batch params must not request streaming");
});

test("carries the custom_id used to key results back", () => {
  assert.equal(req({ customId: "vrf-p07" }).custom_id, "vrf-p07");
});

test("mirrors runClaude's shape so batched grades stay comparable", () => {
  const p = req().params;
  assert.equal(p.thinking.type, "adaptive");
  assert.equal(p.output_config.effort, "high");
  assert.equal(p.output_config.format.type, "json_schema");
  assert.equal(p.system[0].cache_control.type, "ephemeral", "the shared prefix must still cache");
  assert.equal(p.messages[0].role, "user");
});

test("parses a succeeded entry's JSON", () => {
  const r = parseJsonEntry({ ok: true, value: '{"scores":{"accuracy":8}}', usage: { output_tokens: 5 } }, "p01");
  assert.equal(r.ok, true);
  assert.equal(r.value.scores.accuracy, 8);
});

test("a missing result is an error, not a silent pass", () => {
  // Results come back unordered; a probe with no entry must be visible.
  const r = parseJsonEntry(undefined, "p09");
  assert.equal(r.ok, false);
  assert.match(r.error, /no batch result for p09/);
});

test("unparseable grader output is reported, not thrown", () => {
  const r = parseJsonEntry({ ok: true, value: "not json", usage: null }, "p01");
  assert.equal(r.ok, false);
  assert.match(r.error, /unparseable JSON/);
});

test("a grader refusal is surfaced as a failure", () => {
  const r = parseJsonEntry({ ok: true, value: "{}", stopReason: "refusal" }, "p01");
  assert.equal(r.ok, false);
  assert.match(r.error, /refused/);
});

test("an errored entry passes its error through", () => {
  const r = parseJsonEntry({ ok: false, error: "overloaded" }, "p01");
  assert.equal(r.ok, false);
  assert.equal(r.error, "overloaded");
});
