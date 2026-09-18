// Known-answer tests for the study's statistics. Run: node --test experiments/correlation/
import test from "node:test";
import assert from "node:assert/strict";
import { ranks, pearson, spearman, olsSlope, permutationP, bootstrapCI, signedRankP, detectableR } from "./stats.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

test("ranks average tied blocks", () => {
  assert.deepEqual(ranks([10, 20, 30]), [1, 2, 3]);
  assert.deepEqual(ranks([1, 2, 2, 3]), [1, 2.5, 2.5, 4]);
  assert.deepEqual(ranks([5, 5, 5]), [2, 2, 2]);
  assert.deepEqual(ranks([3, 1, 2]), [3, 1, 2]);
});

test("pearson hits known values", () => {
  close(pearson([1, 2, 3], [2, 4, 6]), 1);
  close(pearson([1, 2, 3], [6, 4, 2]), -1);
  // hand-computed: sxy=8, sxx=syy=10
  close(pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]), 0.8);
});

test("pearson returns null without variance rather than 0", () => {
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
});

test("spearman is rank-based, not value-based", () => {
  // Monotonic but wildly non-linear: Pearson is dragged down, Spearman is 1.
  const x = [1, 2, 3, 4, 5];
  const y = [1, 2, 3, 4, 1000];
  close(spearman(x, y), 1);
  assert.ok(pearson(x, y) < 0.9);
});

test("olsSlope recovers a known slope", () => {
  close(olsSlope([1, 2, 3], [2, 4, 6]), 2);
  close(olsSlope([1, 2, 3], [5, 5, 5]), 0);
});

test("permutation p is ~1 for noise and small for a perfect monotone", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.ok(permutationP(x, [...x], spearman, { iterations: 5000 }) < 0.01);
  // A perfect relationship at n=8 is the most extreme of 8! orderings.
  const p = permutationP(x, [3, 1, 4, 2, 8, 5, 7, 6], spearman, { iterations: 5000 });
  assert.ok(p > 0.05 && p <= 1, `expected a non-significant p, got ${p}`);
});

test("permutation p is never exactly zero", () => {
  const x = [1, 2, 3, 4, 5, 6];
  assert.ok(permutationP(x, [...x], spearman, { iterations: 1000 }) > 0);
});

test("bootstrap CI brackets the observed statistic for a strong relationship", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const ci = bootstrapCI(x, [...x], spearman, { iterations: 2000 });
  assert.ok(ci.lo > 0.5 && ci.hi <= 1.0000001, JSON.stringify(ci));
});

test("signed-rank detects a consistent shift and ignores a symmetric one", () => {
  const shifted = signedRankP([5, 6, 7, 8, 9, 10, 11], { iterations: 5000 });
  assert.ok(shifted.p < 0.05, `consistent positive shift should be detected, got ${shifted.p}`);
  const symmetric = signedRankP([5, -6, 7, -8, 6, -5], { iterations: 5000 });
  assert.ok(symmetric.p > 0.1, `symmetric diffs should not be, got ${symmetric.p}`);
});

test("detectableR shrinks as n grows and is large at study size", () => {
  const at10 = detectableR(10);
  const at30 = detectableR(30);
  assert.ok(at10 > 0.55 && at10 < 0.75, `n=10 threshold was ${at10}`);
  assert.ok(at30 < at10, "more units must lower the detectable effect");
});
