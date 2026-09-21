import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { probeRunStatus, probeRunFileComplete, inputUnchanged } from "../src/run/complete.js";
import { estimateRun, needsConfirmation, ceilingFromEnv, UNIT_COSTS } from "../src/run/estimate.js";
import { runPipeline } from "../src/run/pipeline.js";
import { resolveTarget } from "../src/target/index.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "geo-pipeline-"));

// --------------------------------------------------- completion predicate ---
// This has been wrong twice. Each case below is a bug that shipped or nearly did.

const run = (o) => ({ probe_count: 6, graded_count: 0, refusal_count: 0, error_count: 0, ...o });

test("a run with answers but no grades is NOT complete", () => {
  // The original bug: the file exists because answers were written before the
  // grading batch returned.
  const s = probeRunStatus(run({ graded_count: 0 }));
  assert.equal(s.complete, false);
  assert.equal(s.settled, false);
});

test("1 of 6 graded is NOT complete — `graded_count > 0` was the second bug", () => {
  assert.equal(probeRunStatus(run({ graded_count: 1 })).complete, false);
});

test("5 graded + 1 refusal IS complete — refusals are terminal", () => {
  // `graded === probe_count` would have called this unfinished forever and
  // re-paid for an answer the model already declined to give.
  const s = probeRunStatus(run({ graded_count: 5, refusal_count: 1 }));
  assert.equal(s.settled, true);
  assert.equal(s.complete, true);
});

test("5 graded + 1 error is NOT complete — errors are retryable", () => {
  const s = probeRunStatus(run({ graded_count: 5, error_count: 1 }));
  assert.equal(s.settled, true, "it has settled");
  assert.equal(s.complete, false, "but it is not done: the error is retryable");
  assert.match(s.reason, /retryable/);
});

test("all six graded is complete", () => {
  assert.equal(probeRunStatus(run({ graded_count: 6 })).complete, true);
});

test("unreadable or empty runs are never complete", () => {
  assert.equal(probeRunStatus(null).complete, false);
  assert.equal(probeRunStatus({}).complete, false);
  assert.equal(probeRunStatus(run({ probe_count: 0 })).complete, false);
});

test("a file that exists but is ungraded does not count as complete", () => {
  const dir = tmp();
  const f = path.join(dir, "probe-results-web.json");
  fs.writeFileSync(f, JSON.stringify(run({ graded_count: 0 })));
  assert.equal(probeRunFileComplete(f), false);
  fs.writeFileSync(f, JSON.stringify(run({ graded_count: 6 })));
  assert.equal(probeRunFileComplete(f), true);
});

test("unknown provenance means re-run, not trust", () => {
  assert.equal(inputUnchanged(undefined, "abc"), false);
  assert.equal(inputUnchanged("abc", undefined), false);
  assert.equal(inputUnchanged("abc", "abc"), true);
  assert.equal(inputUnchanged("abc", "def"), false);
});

// ------------------------------------------------------------- estimation ---

test("estimate scales with pages, probes and mode", () => {
  const e = estimateRun({ pageCount: 10, stages: ["audit"], probesPerPage: 6 });
  assert.equal(Number(e.total.toFixed(4)), Number((10 * UNIT_COSTS.audit).toFixed(4)));

  const web = estimateRun({ pageCount: 10, stages: ["test"], probesPerPage: 6, mode: "web" });
  const closed = estimateRun({ pageCount: 10, stages: ["test"], probesPerPage: 6, mode: "closed" });
  assert.ok(closed.total < web.total, "closed mode must be cheaper than web");
});

test("estimate omits stages that are not selected", () => {
  const e = estimateRun({ pageCount: 5, stages: ["resolve", "rollup"] });
  assert.equal(e.total, 0, "resolve and rollup are local computation");
});

test("the cost ceiling gates only what exceeds it", () => {
  assert.equal(needsConfirmation(5, 10), false);
  assert.equal(needsConfirmation(50, 10), true);
  assert.equal(ceilingFromEnv({}), 10);
  assert.equal(ceilingFromEnv({ GEO_COST_CEILING: "250" }), 250);
  assert.throws(() => ceilingFromEnv({ GEO_COST_CEILING: "abc" }), /non-negative number/);
});

// --------------------------------------------------------------- pipeline ---

/** Stubs that count calls, so "no paid work" is measured rather than asserted. */
function countingDeps(counts) {
  return {
    extractPage: async (url) => {
      counts.extract++;
      return { url, finalUrl: url, markdown: "# Title\n\nbody text", format: "html" };
    },
    buildPageContent: () => "page content v1",
    runAudit: async () => {
      counts.audit++;
      return "## GEO Score: 70/100 — Good\n";
    },
    genProbes: async () => {
      counts.probes++;
      return { probes: [{ id: "p01", prompt: "q" }] };
    },
    runProbes: async () => {
      counts.test++;
      return { probe_count: 1, graded_count: 1, refusal_count: 0, error_count: 0, results: [] };
    },
  };
}

const pageTarget = async () => resolveTarget("page:https://docs.chain.link/ace");

test("a first run performs the paid work", async () => {
  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  const report = await runPipeline({
    target: await pageTarget(),
    stages: ["audit", "probes", "test"],
    root: tmp(),
    deps: countingDeps(counts),
  });
  assert.deepEqual({ audit: counts.audit, probes: counts.probes, test: counts.test }, { audit: 1, probes: 1, test: 1 });
  assert.equal(report.failures.length, 0);
});

test("re-running a completed target issues ZERO paid calls", async () => {
  const root = tmp();
  const target = await pageTarget();
  const first = { extract: 0, audit: 0, probes: 0, test: 0 };
  await runPipeline({ target, stages: ["audit", "probes", "test"], root, deps: countingDeps(first) });

  const second = { extract: 0, audit: 0, probes: 0, test: 0 };
  const report = await runPipeline({ target, stages: ["audit", "probes", "test"], root, deps: countingDeps(second) });

  assert.deepEqual(
    { audit: second.audit, probes: second.probes, test: second.test },
    { audit: 0, probes: 0, test: 0 },
    "a resumed run must not re-pay",
  );
  assert.deepEqual(report.skipped, { audit: 1, probes: 1, test: 1 });
});

test("--force re-does the work", async () => {
  const root = tmp();
  const target = await pageTarget();
  await runPipeline({ target, stages: ["audit"], root, deps: countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 }) });
  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  await runPipeline({ target, stages: ["audit"], root, force: true, deps: countingDeps(counts) });
  assert.equal(counts.audit, 1);
});

test("a stage whose input content changed is re-run, not skipped", async () => {
  const root = tmp();
  const target = await pageTarget();
  const deps = countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 });
  await runPipeline({ target, stages: ["audit"], root, deps });

  // Same page, different content — an edit between runs.
  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  const changed = { ...countingDeps(counts), buildPageContent: () => "page content v2 — EDITED" };
  await runPipeline({ target, stages: ["audit"], root, deps: changed });
  assert.equal(counts.audit, 1, "edited content must not be scored against a stale audit");
});

test("one failing page does not abort the run, and is recorded with a reason", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-wl-"));
  const wl = path.join(dir, "watchlists");
  fs.mkdirSync(wl, { recursive: true });
  fs.writeFileSync(
    path.join(wl, "mixed.json"),
    JSON.stringify({
      version: 1,
      name: "mixed",
      pages: ["https://docs.chain.link/good", "https://docs.chain.link/bad", "https://docs.chain.link/good2"],
    }),
  );
  const target = await resolveTarget("watchlist:mixed", { watchlistDir: wl });

  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  const deps = countingDeps(counts);
  const exploding = {
    ...deps,
    extractPage: async (url) => {
      if (url.endsWith("/bad")) throw new Error("HTTP 404");
      return deps.extractPage(url);
    },
  };

  const report = await runPipeline({ target, stages: ["audit"], root: tmp(), concurrency: 2, deps: exploding });
  assert.equal(report.pages.length, 2, "the two good pages still completed");
  assert.equal(report.failures.length, 1);
  assert.match(report.failures[0].error, /404/);
  assert.ok(report.failures[0].url.endsWith("/bad"));
});

test("the ledger is written for every target type", async () => {
  const root = tmp();
  const report = await runPipeline({
    target: await pageTarget(),
    stages: ["audit"],
    root,
    deps: countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 }),
  });
  const ledger = JSON.parse(fs.readFileSync(path.join(report.outRoot, "pages.json"), "utf8"));
  assert.equal(ledger.ledger.length, 1);
  assert.equal(ledger.counts.failed, 0);
});

test("the test stage refuses to run without a probe set rather than inventing one", async () => {
  const report = await runPipeline({
    target: await pageTarget(),
    stages: ["test"],
    root: tmp(),
    deps: countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 }),
  });
  assert.equal(report.failures.length, 1);
  assert.match(report.failures[0].error, /no probe set/);
});

test("the rollup stage writes a target-level rollup from the pages that succeeded", async () => {
  const root = tmp();
  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  const deps = {
    ...countingDeps(counts),
    // A page shaped the way extract.js emits, so runChecks has something real
    // to assess rather than an empty object.
    extractPage: async (url) => {
      counts.extract++;
      return {
        url,
        finalUrl: url,
        format: "html",
        title: "Title",
        markdown: "# Title\n\n## Section\n\nSome body text with detail.\n\n```js\nconst x = 1;\n```\n",
        head: {},
        jsonLd: [],
      };
    },
  };
  const report = await runPipeline({
    target: await pageTarget(),
    stages: ["audit", "rollup"],
    root,
    deps,
  });
  assert.ok(report.rollup, "rollup should be reported");
  const view = JSON.parse(fs.readFileSync(report.rollup.file, "utf8"));
  assert.ok(Number.isFinite(view.score), `rollup score should be a number, got ${view.score}`);
  assert.ok(Array.isArray(view.checks) && view.checks.length, "rollup should carry per-check results");
});

test("rollup is skipped rather than crashing when every page failed", async () => {
  const deps = {
    ...countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 }),
    extractPage: async () => {
      throw new Error("HTTP 500");
    },
  };
  const report = await runPipeline({ target: await pageTarget(), stages: ["audit", "rollup"], root: tmp(), deps });
  assert.equal(report.pages.length, 0);
  assert.equal(report.failures.length, 1);
  assert.equal(report.rollup, undefined, "no pages means no rollup, not a crash");
});
