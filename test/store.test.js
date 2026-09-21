import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pageKey, assertUniqueKeys } from "../src/store/slug.js";
import { slugFromUrl } from "../src/probes.js";
import {
  newRunId, createManifest, writeManifest, listRuns, canTransition, assertTransition,
  reconcileInterrupted, protocolFingerprint, runHealth, RUN_STATUS, ownerAlive,
} from "../src/store/run.js";
import { buildPoint, appendPoint, segmentsFor, discontinuities, postsTrendPoint } from "../src/store/timeseries.js";
import { project, indexBytesPerRow, INDEX_FIELDS, bandFor } from "../src/store/project.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "geo-store-"));

// A genuine audit report, with the URL and score swapped. Keeps the fixture
// honest: parseAudit actually has to parse it, and prose lengths are realistic.
const AUDIT_TEMPLATE = fs.readFileSync("results/ace/audit.md", "utf8");
const realAudit = ({ url, score }) =>
  AUDIT_TEMPLATE.replace(/^\*\*URL:\*\* .*$/m, `**URL:** ${url}`).replace(
    /^## GEO Score: [\d.]+\/100 — .*$/m,
    `## GEO Score: ${score}/100 — Good`,
  );

// ------------------------------------------------------------------ slugs ---

test("the existing slug scheme really does collide across products", () => {
  // Not hypothetical — this is why the store needs its own key.
  assert.equal(
    slugFromUrl("https://docs.chain.link/ccip/getting-started/evm"),
    slugFromUrl("https://docs.chain.link/vrf/getting-started/evm"),
  );
});

test("full-path keys separate pages the old scheme merged", () => {
  const a = pageKey("https://docs.chain.link/ccip/getting-started/evm");
  const b = pageKey("https://docs.chain.link/vrf/getting-started/evm");
  assert.notEqual(a, b);
  assert.equal(a, "ccip-getting-started-evm");
  assert.equal(b, "vrf-getting-started-evm");
});

test("a genuine key collision fails loudly instead of overwriting", () => {
  assert.throws(
    () => assertUniqueKeys(["https://a.example/x/y", "https://b.example/x/y"]),
    /collision — refusing to overwrite/,
  );
  assert.doesNotThrow(() => assertUniqueKeys(["https://a.example/x", "https://a.example/y"]));
});

// ------------------------------------------------------------------- runs ---

test("run ids sort chronologically", () => {
  const a = newRunId(new Date("2026-01-01T00:00:00Z"));
  const b = newRunId(new Date("2026-06-01T00:00:00Z"));
  assert.ok(a < b, `${a} should sort before ${b}`);
});

test("status transitions are constrained", () => {
  assert.ok(canTransition("queued", "running"));
  assert.ok(canTransition("running", "partial"));
  assert.ok(!canTransition("complete", "running"), "a finished run cannot restart");
  assert.ok(!canTransition("queued", "complete"), "a run cannot finish without running");
  assert.throws(() => assertTransition("complete", "running"), /illegal run status transition/);
});

test("only a complete run may post a trend point", () => {
  assert.equal(RUN_STATUS.complete.postsTrend, true);
  // A partial run's average is over a self-narrowed denominator.
  assert.equal(RUN_STATUS.partial.postsTrend, false);
  assert.equal(RUN_STATUS.cancelled.postsTrend, false);
  assert.equal(RUN_STATUS.interrupted.postsTrend, false);
});

test("runs are immutable: a second run does not modify the first", () => {
  const root = tmp();
  const a = writeManifest(root, createManifest({ runId: newRunId(new Date("2026-01-01")), target: { type: "page", name: "x" }, stages: ["audit"], protocol: {} }));
  const before = fs.readFileSync(path.join(root, "runs", a.runId, "manifest.json"), "utf8");
  writeManifest(root, createManifest({ runId: newRunId(new Date("2026-02-01")), target: { type: "page", name: "x" }, stages: ["audit"], protocol: {} }));
  const after = fs.readFileSync(path.join(root, "runs", a.runId, "manifest.json"), "utf8");
  assert.equal(before, after, "the earlier run was mutated");
  assert.equal(listRuns(root).length, 2);
});

test("a run left running by a DEAD process is reconciled to interrupted, never auto-resumed", () => {
  const root = tmp();
  const m = createManifest({ runId: newRunId(), target: { type: "page", name: "x" }, stages: ["audit"], protocol: {} });
  writeManifest(root, { ...m, status: "running" });
  // The manifest's owner is this very process, which is alive — so liveness has
  // to be stubbed to represent the crash this reconciles.
  const fixed = reconcileInterrupted(root, new Date(), { isAlive: () => false });
  assert.deepEqual(fixed, [m.runId]);
  assert.equal(listRuns(root)[0].status, "interrupted");
});

test("run health is derived from signals that already exist", () => {
  assert.deepEqual(runHealth([{ search_degraded_count: 0, live_search_failed_count: 0 }]), { degraded: 0, failed: 0, clean: true });
  assert.equal(runHealth([{ search_degraded_count: 2 }]).clean, false);
});

// ------------------------------------------------------------- timeseries ---

const manifest = (o = {}) => ({
  runId: o.runId ?? "r1",
  status: o.status ?? "complete",
  endedAt: o.at ?? "2026-01-01T00:00:00Z",
  target: { type: "product", name: "vrf" },
  protocol: { graderModel: o.grader ?? "claude-sonnet-5", probeEffort: "medium", probeModel: "claude-opus-4-8", mode: "web" },
  protocolFingerprint: protocolFingerprint({ graderModel: o.grader ?? "claude-sonnet-5", probeEffort: "medium", probeModel: "claude-opus-4-8", mode: "web" }),
});

test("a cancelled or partial run posts NO trend point", () => {
  assert.equal(buildPoint({ manifest: manifest({ status: "cancelled" }), fidelity: 80 }), null);
  assert.equal(buildPoint({ manifest: manifest({ status: "partial" }), fidelity: 80 }), null);
  assert.ok(buildPoint({ manifest: manifest({ status: "complete" }), fidelity: 80 }));
  assert.equal(postsTrendPoint(manifest({ status: "partial" })), false);
});

test("score and fidelity are separate fields and are never combined", () => {
  const p = buildPoint({ manifest: manifest(), score: 70, fidelity: 40 });
  assert.equal(p.score, 70);
  assert.equal(p.fidelity, 40);
  assert.ok(!("combined" in p) && !("overall" in p));
});

test("a trend spanning two graders does NOT render as one continuous series", () => {
  const points = [
    buildPoint({ manifest: manifest({ runId: "r1", at: "2026-01-01T00:00:00Z", grader: "claude-opus-4-8" }), fidelity: 70 }),
    buildPoint({ manifest: manifest({ runId: "r2", at: "2026-02-01T00:00:00Z", grader: "claude-opus-4-8" }), fidelity: 72 }),
    // Grader swap: Sonnet grades ~12 points harsher, so joining these would
    // show a 12-point "regression" that is purely a model change.
    buildPoint({ manifest: manifest({ runId: "r3", at: "2026-03-01T00:00:00Z", grader: "claude-sonnet-5" }), fidelity: 60 }),
  ];
  const segs = segmentsFor(points);
  assert.equal(segs.length, 2, "must split into one segment per grader");
  assert.equal(segs[0].points.length, 2);
  assert.equal(segs[1].points.length, 1);

  const marks = discontinuities(points);
  assert.equal(marks.length, 1);
  assert.match(marks[0].reason, /grader changed/);
});

test("points with unknown protocol are never joined to a known-protocol line", () => {
  const unknown = buildPoint({
    manifest: { ...manifest({ runId: "old", at: "2025-12-01T00:00:00Z" }), protocol: {}, protocolFingerprint: "unknown|unknown|unknown|unknown" },
    fidelity: 55,
  });
  assert.equal(unknown.protocolKnown, false);
  const segs = segmentsFor([unknown, buildPoint({ manifest: manifest({ runId: "r1" }), fidelity: 70 })]);
  assert.equal(segs.length, 2);
});

test("appending a point replaces the same run rather than duplicating it", () => {
  let s = [];
  s = appendPoint(s, buildPoint({ manifest: manifest({ runId: "r1" }), fidelity: 70 }));
  s = appendPoint(s, buildPoint({ manifest: manifest({ runId: "r1" }), fidelity: 75 }));
  assert.equal(s.length, 1);
  assert.equal(s[0].fidelity, 75);
});

// -------------------------------------------------------------- projection ---

function seedRun(root, { runId, url, score, fidelity, grader = "claude-sonnet-5", status = "complete" }) {
  const m = createManifest({ runId, target: { type: "product", name: "vrf" }, stages: ["audit", "test"], protocol: { graderModel: grader, probeEffort: "medium", probeModel: "claude-opus-4-8", mode: "web" } });
  writeManifest(root, { ...m, status, endedAt: new Date().toISOString(), counts: { pages: 1, failed: 0 } });
  const key = pageKey(url);
  const dir = path.join(root, "runs", runId, "pages", key);
  fs.mkdirSync(dir, { recursive: true });
  // A real audit, retargeted. A synthetic one does not exercise parseAudit, and
  // the byte-per-row assertion is only meaningful against real prose lengths.
  fs.writeFileSync(path.join(dir, "audit.md"), realAudit({ url, score }));
  fs.writeFileSync(
    path.join(dir, "probe-results-web.json"),
    JSON.stringify({
      mode: "web", grader_model: grader, probe_count: 6, graded_count: 6, avg_fidelity: fidelity,
      search_degraded_count: 0, live_search_failed_count: 0,
      // A realistically heavy payload — this is what must NOT reach the index.
      results: Array.from({ length: 6 }, (_, i) => ({ probe_id: `p0${i}`, answer: "x".repeat(4000), fidelity })),
    }),
  );
  return key;
}

test("the index excludes probe payloads and stays under 500 bytes per row", () => {
  const root = tmp();
  for (let i = 0; i < 20; i++) {
    seedRun(root, {
      runId: newRunId(new Date(2026, 0, i + 1)),
      url: `https://docs.chain.link/ccip/guides/a-realistic-page-path-${i}`,
      score: 60 + i, fidelity: 40 + i,
    });
  }
  project(root);

  const indexFile = path.join(root, "dashboard", "index.json");
  const bytes = indexBytesPerRow(indexFile);
  assert.ok(bytes < 500, `index is ${bytes.toFixed(0)} bytes/row`);

  const raw = fs.readFileSync(indexFile, "utf8");
  assert.ok(!raw.includes("xxxx"), "a probe answer leaked into the index");
  assert.ok(!raw.includes("prose"), "audit prose leaked into the index");

  const { pages } = JSON.parse(raw);
  for (const row of pages) {
    for (const k of Object.keys(row)) assert.ok(INDEX_FIELDS.includes(k), `unexpected index field "${k}"`);
  }
});

test("page detail carries what the index leaves out", () => {
  const root = tmp();
  const key = seedRun(root, { runId: newRunId(), url: "https://docs.chain.link/vrf/x", score: 70, fidelity: 55 });
  project(root);
  const detail = JSON.parse(fs.readFileSync(path.join(root, "dashboard", "pages", `${key}.json`), "utf8"));
  assert.ok(detail.probeRuns[0].results[0].answer.length > 100, "detail should hold the full answers");
  assert.ok(detail.audit, "detail should hold the parsed audit");
});

test("deleting dashboard/ and rebuilding reproduces it semantically", () => {
  const root = tmp();
  seedRun(root, { runId: newRunId(), url: "https://docs.chain.link/vrf/x", score: 70, fidelity: 55 });
  const fixed = new Date("2026-05-05T00:00:00Z");
  project(root, { now: fixed });
  const first = fs.readFileSync(path.join(root, "dashboard", "index.json"), "utf8");

  fs.rmSync(path.join(root, "dashboard"), { recursive: true });
  project(root, { now: fixed });
  const second = fs.readFileSync(path.join(root, "dashboard", "index.json"), "utf8");
  assert.equal(first, second);
});

test("a partial run contributes pages but no trend point", () => {
  const root = tmp();
  seedRun(root, { runId: newRunId(new Date(2026, 0, 1)), url: "https://docs.chain.link/vrf/a", score: 70, fidelity: 55, status: "complete" });
  seedRun(root, { runId: newRunId(new Date(2026, 0, 2)), url: "https://docs.chain.link/vrf/b", score: 80, fidelity: 90, status: "partial" });
  project(root);
  const ts = JSON.parse(fs.readFileSync(path.join(root, "dashboard", "timeseries.json"), "utf8"));
  assert.equal(ts.points.length, 1, "the partial run must not post a point");
  assert.equal(ts.points[0].fidelity, 55);
});

test("bands are assigned at the documented thresholds", () => {
  assert.equal(bandFor(90), "Exemplary");
  assert.equal(bandFor(70), "Strong");
  assert.equal(bandFor(55), "Good");
  assert.equal(bandFor(40), "Developing");
  assert.equal(bandFor(10), "Poor");
  assert.equal(bandFor(null), null);
});

test("a trend never joins points from different targets", () => {
  // Found by populating the dashboard for real: a 10-page study average and a
  // 1-page run were being drawn as one line. Different denominators, different
  // populations — joining them reads as a quality change that did not happen.
  const mk = (target, at, fidelity) => ({
    runId: at, at, target, fidelity, score: null,
    graderModel: "claude-sonnet-5", fingerprint: "claude-sonnet-5|x|medium|web", protocolKnown: true,
  });
  const segs = segmentsFor(
    [mk("watchlist:study", "2026-09-18", 52), mk("page:ace", "2026-09-21", 69)],
    { field: "fidelity" },
  );
  assert.equal(segs.length, 2, "points from different targets must not share a line");
  assert.equal(segs[0].target, "watchlist:study");
});

test("an audit-only run must not erase fidelity measured by an earlier run", () => {
  // Found against real data: a `--stages audit` re-run became the latest run for
  // every page and the dashboard reported 0 probed pages despite holding 10
  // pages of real fidelity. Latest per ARTIFACT, not latest run wholesale.
  const root = tmp();
  const url = "https://docs.chain.link/vrf/x";
  const key = seedRun(root, { runId: newRunId(new Date(2026, 0, 1)), url, score: 70, fidelity: 55 });

  // A later run that produced only an audit.
  const later = newRunId(new Date(2026, 0, 9));
  writeManifest(root, {
    ...createManifest({
      runId: later,
      target: { type: "watchlist", name: "w" },
      stages: ["audit"],
      protocol: { graderModel: "claude-sonnet-5", probeEffort: "medium", probeModel: "claude-opus-4-8", mode: "web" },
    }),
    status: "complete",
    endedAt: new Date().toISOString(),
  });
  const dir = path.join(root, "runs", later, "pages", key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "audit.md"), realAudit({ url, score: 88 }));

  project(root);
  const row = JSON.parse(fs.readFileSync(path.join(root, "dashboard", "index.json"), "utf8")).pages[0];
  assert.equal(row.score, 88, "the newer audit should win");
  assert.equal(row.fidelity, 55, "the earlier fidelity must survive an audit-only run");

  const detail = JSON.parse(fs.readFileSync(path.join(root, "dashboard", "pages", `${key}.json`), "utf8"));
  assert.equal(detail.provenance.audit, later);
  assert.ok(detail.provenance.probes.web, "probe provenance should name the run it came from");
});

test("interleaved targets do not fragment each other's series", () => {
  // Also found against real data: walking one globally time-sorted list let a
  // one-page run land between two points of a ten-page series and split it.
  const mk = (target, at, score) => ({
    runId: `${target}-${at}`, at, target, score, fidelity: null,
    graderModel: "claude-sonnet-5", fingerprint: "claude-sonnet-5|x|medium|web", protocolKnown: true,
  });
  const segs = segmentsFor(
    [
      mk("watchlist:study", "2026-09-18", 62),
      mk("page:ace", "2026-09-19", 69),
      mk("watchlist:study", "2026-09-21", 63),
    ],
    { field: "score" },
  );
  const study = segs.find((s) => s.target === "watchlist:study");
  assert.equal(study.points.length, 2, "the study's two points must stay on one line");
  assert.equal(segs.length, 2);
});

test("reconciliation leaves a run alone while its owner is still alive", () => {
  // Observed live: starting `serve` during a 43-page CLI run marked that run
  // interrupted while it was working, because reconciliation ran on JobManager
  // construction and could not tell a dead process from a busy one.
  const root = tmp();
  const m = createManifest({ runId: newRunId(), target: { type: "page", name: "x" }, stages: ["audit"], protocol: {} });
  writeManifest(root, { ...m, status: "running" });

  const untouched = reconcileInterrupted(root, new Date(), { isAlive: () => true });
  assert.deepEqual(untouched, [], "a live run must not be marked interrupted");
  assert.equal(listRuns(root)[0].status, "running");

  const dead = reconcileInterrupted(root, new Date(), { isAlive: () => false });
  assert.deepEqual(dead, [m.runId], "a dead owner's run should be reconciled");
  assert.equal(listRuns(root)[0].status, "interrupted");
});

test("a run owned by another host is not judged from here", () => {
  const root = tmp();
  const m = createManifest({ runId: newRunId(), target: { type: "page", name: "x" }, stages: ["audit"], protocol: {} });
  writeManifest(root, { ...m, status: "running", owner: { pid: 1, host: "some-other-machine" } });
  assert.deepEqual(reconcileInterrupted(root, new Date(), { isAlive: () => false }), []);
});
