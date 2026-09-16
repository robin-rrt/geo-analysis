import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pivotRuns, toCsv } from "../src/dashboard/matrix.js";
import { loadProbeRuns } from "../src/dashboard/collect.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const probes = [
  { id: "p01", archetype: "direct-howto", prompt: 'Say "hi", then go' },
  { id: "p02", archetype: "code-first", prompt: "Show code" },
];
const probe = (id, over = {}) => ({
  id,
  fidelity: 70,
  hit: true,
  via: "citation",
  stop: "end_turn",
  hallucinations: [{ severity: "high" }, { severity: "low" }],
  ...over,
});
const run = (model, mode, runProbes, runAt = "2026-09-10") => ({
  model,
  mode,
  runAt,
  graderModel: "claude-opus-4-8",
  probes: runProbes,
});

test("a partial run has empty cells and a graded count below total", () => {
  const m = pivotRuns(
    [run("a", "web", [probe("p01"), probe("p02")]), run("b", "web", [probe("p01")])],
    probes,
  );
  assert.deepEqual(
    m.columns.map((c) => [c.key, c.graded, c.total]),
    [["a|web", 2, 2], ["b|web", 1, 2]],
  );
  assert.equal(m.rows[1].cells["b|web"], null);
  assert.equal(m.rows[0].cells["a|web"].highSev, 1);
});

test("the newest run wins when a model × mode repeats", () => {
  const m = pivotRuns(
    [run("a", "web", [probe("p01", { fidelity: 90 })], "2026-09-10"), run("a", "web", [probe("p01", { fidelity: 10 })], "2026-01-01")],
    probes,
  );
  assert.equal(m.columns.length, 1);
  assert.equal(m.rows[0].cells["a|web"].fidelity, 90);
});

test("CSV quotes prompts and leaves unknowns empty, never 0", () => {
  const csv = toCsv(
    pivotRuns(
      [
        run("a", "web", [probe("p01"), probe("p02", { fidelity: null, stop: "refusal", hit: false })]),
        run("a", "closed", [probe("p01", { hit: null, via: null }), probe("p02", { stop: "error", fidelity: null, hit: null })]),
      ],
      probes,
    ),
  );
  const lines = csv.trimEnd().split("\r\n");
  assert.equal(
    lines[0],
    "probe_id,archetype,prompt,a|web fidelity,a|web hit,a|web high_sev,a|closed fidelity,a|closed hit,a|closed high_sev",
  );
  assert.equal(lines[1], 'p01,direct-howto,"Say ""hi"", then go",70,1,1,70,,1');
  assert.equal(lines[2], "p02,code-first,Show code,,,,,,");
  assert.ok(csv.endsWith("\r\n"));
});

test("real results: each probed page pivots to one current column", () => {
  for (const slug of ["workflow-using-randomness", "concepts-non-determinism-go"]) {
    const { probeSet, runs } = loadProbeRuns(path.join(root, "results", slug));
    const current = runs.filter((r) => r.current && r.mode === "web");
    assert.equal(current.length, 1, slug);
    const m = pivotRuns(current, probeSet.probes);
    assert.equal(m.rows.length, 10);
    assert.equal(m.columns[0].graded, 10);
    assert.equal(toCsv(m).trimEnd().split("\r\n").length, 11);
  }
});
