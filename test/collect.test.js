import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "../src/dashboard/collect.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = collect(path.join(root, "results"));
const page = (slug) => data.pages.find((p) => p.slug === slug);

test("the headline run is a web run on the current probe set", () => {
  for (const slug of ["workflow-using-randomness", "concepts-non-determinism-go"]) {
    const run = page(slug).primaryRun;
    assert.equal(run.mode, "web", slug);
    assert.equal(run.current, true, slug);
  }
});

test("legacy retrieval verdicts are recomputed with the harness rule", () => {
  const randomness = page("workflow-using-randomness").primaryRun;
  const p10 = randomness.probes.find((p) => p.id === "p10");
  assert.deepEqual([p10.hit, p10.via, p10.recomputed], [true, "mention", true]);
  assert.equal(randomness.hitRate, 0.3);
  assert.equal(randomness.hitCorrections, 0);

  // The grader called p02 a miss on the same evidence it called a hit in p10.
  const concepts = page("concepts-non-determinism-go").primaryRun;
  const p02 = concepts.probes.find((p) => p.id === "p02");
  assert.deepEqual([p02.hit, p02.graderHit, p02.via], [true, false, "mention"]);
  assert.equal(concepts.hitRate, 0.3);
  assert.equal(concepts.hitCorrections, 1);
});

test("the correction is disclosed, not silent", () => {
  assert.ok(data.aggregates.coverageNotes.some((n) => /recomputed/.test(n)));
  assert.equal(data.aggregates.hitRate, 0.3); // 6 of 20
});

test("stored fidelity averages are unchanged", () => {
  assert.equal(page("workflow-using-randomness").primaryRun.avgFidelity, 62.3);
  assert.equal(page("concepts-non-determinism-go").primaryRun.avgFidelity, 55.6);
});
