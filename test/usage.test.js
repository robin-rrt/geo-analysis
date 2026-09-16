import test from "node:test";
import assert from "node:assert/strict";
import { createTally, costOf, PRICES } from "../src/usage.js";

// A realistic Opus 4.8 usage block: mostly cached prefix, modest fresh input.
const usage = (o = {}) => ({
  input_tokens: 1000,
  output_tokens: 2000,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  ...o,
});

test("prices every model the CLI can select", () => {
  // analystModel() can return either of these; a missing row means silent
  // "cost unknown" on a normal run.
  for (const m of ["claude-opus-4-8", "claude-fable-5"]) {
    assert.ok(PRICES[m], `${m} must be priced`);
    assert.ok(PRICES[m].checked, `${m} must record when its price was checked`);
  }
});

test("costs input and output at their different rates", () => {
  // 1k in @ $5/M = $0.005; 2k out @ $25/M = $0.05
  assert.equal(costOf("claude-opus-4-8", usage()).toFixed(4), "0.0550");
});

test("cache reads cost a tenth of fresh input, writes a fifth more", () => {
  const read = costOf("claude-opus-4-8", usage({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 }));
  const write = costOf("claude-opus-4-8", usage({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 }));
  const fresh = costOf("claude-opus-4-8", usage({ input_tokens: 1_000_000, output_tokens: 0 }));

  assert.equal(read.toFixed(2), "0.50", "read is 0.1x");
  assert.equal(write.toFixed(2), "6.25", "write is 1.25x");
  assert.equal(fresh.toFixed(2), "5.00");
  assert.ok(read < fresh, "caching must be cheaper than not caching");
});

test("returns null for an unpriced model rather than guessing", () => {
  assert.equal(costOf("some-future-model", usage()), null);
});

test("groups by label so spend is attributable to a stage", () => {
  const t = createTally();
  t.add("audit", "claude-opus-4-8", usage());
  t.add("grader", "claude-opus-4-8", usage({ output_tokens: 500 }));
  t.add("grader", "claude-opus-4-8", usage({ output_tokens: 500 }));

  const s = t.summary();
  assert.equal(s.calls, 3);
  assert.equal(s.byLabel.grader.calls, 2);
  assert.equal(s.byLabel.audit.calls, 1);
  assert.ok(s.byLabel.audit.cost > s.byLabel.grader.cost / 2, "labels priced independently");
  assert.equal(s.output, 3000);
});

test("an unpriced call makes the total null, not wrong", () => {
  const t = createTally();
  t.add("audit", "claude-opus-4-8", usage());
  t.add("probe", "gpt-whatever", usage());

  const s = t.summary();
  assert.equal(s.cost, null, "a partial total would understate the true spend");
  assert.equal(s.byLabel.audit.cost !== null, true, "the priced label still reports");
});

test("reports cache hit rate over cacheable input only", () => {
  const t = createTally();
  t.add("grader", "claude-opus-4-8", usage({ cache_creation_input_tokens: 1000 }));
  t.add("grader", "claude-opus-4-8", usage({ cache_read_input_tokens: 9000 }));

  // 9000 read of 10000 cacheable — fresh input_tokens must not dilute it.
  assert.equal(t.summary().cacheHitRate, 0.9);
});

test("ignores a missing usage block instead of throwing", () => {
  const t = createTally();
  t.add("audit", "claude-opus-4-8", undefined);
  assert.equal(t.summary().calls, 0);
  assert.equal(t.format(), "no API calls recorded");
});

test("format names each stage and the price-checked date", () => {
  const t = createTally();
  t.add("audit", "claude-opus-4-8", usage());
  const out = t.format();
  assert.match(out, /audit: 1 call/);
  assert.match(out, /estimated cost: \$/);
  assert.match(out, /prices checked \d{4}-\d{2}-\d{2}/);
});
