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
      // The REAL shape: genProbes returns a wrapper whose `probes` is the probe
      // SET, whose own `probes` is the array. A stub that returned the array
      // directly hid a bug that cost a 43-page run.
      return { probes: { source_url: "u", probes: [{ id: "p01", prompt: "q" }] }, page: {} };
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

test("a second run never mutates the first — the overwrite hazard is gone", async () => {
  const root = tmp();
  const target = await pageTarget();
  const first = await runPipeline({ target, stages: ["audit"], root, deps: countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 }) });

  const firstAudit = path.join(first.outRoot, "pages", first.pages[0].key, "audit.md");
  const before = fs.readFileSync(firstAudit, "utf8");
  const beforeMtime = fs.statSync(firstAudit).mtimeMs;

  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  const second = await runPipeline({ target, stages: ["audit"], root, deps: countingDeps(counts) });

  assert.notEqual(second.runId, first.runId, "a second run must get its own snapshot");
  assert.equal(fs.readFileSync(firstAudit, "utf8"), before, "the earlier run's audit was modified");
  assert.equal(fs.statSync(firstAudit).mtimeMs, beforeMtime, "the earlier run's audit was rewritten");
  assert.equal(counts.audit, 0, "the second run re-paid for work it could reuse");
  assert.equal(second.reused, 1);
});

test("a run with failures is marked partial, so it cannot post a trend point", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-wl2-"));
  const wl = path.join(dir, "watchlists");
  fs.mkdirSync(wl, { recursive: true });
  fs.writeFileSync(
    path.join(wl, "mixed.json"),
    JSON.stringify({ version: 1, name: "mixed", pages: ["https://docs.chain.link/a/good", "https://docs.chain.link/b/bad"] }),
  );
  const target = await resolveTarget("watchlist:mixed", { watchlistDir: wl });
  const base = countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 });
  const deps = {
    ...base,
    extractPage: async (url) => {
      if (url.endsWith("/bad")) throw new Error("HTTP 404");
      return base.extractPage(url);
    },
  };
  const report = await runPipeline({ target, stages: ["audit"], root: tmp(), deps });
  assert.equal(report.status, "partial");
});

test("colliding page keys are rejected before any money is spent", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-wl3-"));
  const wl = path.join(dir, "watchlists");
  fs.mkdirSync(wl, { recursive: true });
  // Distinct URLs that the OLD slug scheme would merge into one key.
  fs.writeFileSync(
    path.join(wl, "collide.json"),
    JSON.stringify({
      version: 1,
      name: "collide",
      pages: ["https://docs.chain.link/ccip/getting-started/evm", "https://docs.chain.link/vrf/getting-started/evm"],
    }),
  );
  const target = await resolveTarget("watchlist:collide", { watchlistDir: wl });
  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  // Full-path keys keep these distinct, so this must NOT throw.
  const report = await runPipeline({ target, stages: ["audit"], root: tmp(), deps: countingDeps(counts) });
  assert.equal(report.pages.length, 2, "both pages should survive as distinct keys");
  assert.equal(new Set(report.pages.map((p) => p.key)).size, 2);
});

test("cancellation stops new work and marks the run cancelled, not partial", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-wl4-"));
  const wl = path.join(dir, "watchlists");
  fs.mkdirSync(wl, { recursive: true });
  fs.writeFileSync(
    path.join(wl, "many.json"),
    JSON.stringify({
      version: 1,
      name: "many",
      pages: Array.from({ length: 6 }, (_, i) => `https://docs.chain.link/p/page-${i}`),
    }),
  );
  const target = await resolveTarget("watchlist:many", { watchlistDir: wl });

  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  let started = 0;
  const base = countingDeps(counts);
  const deps = {
    ...base,
    extractPage: async (url) => {
      started++;
      return base.extractPage(url);
    },
  };
  const report = await runPipeline({
    target,
    stages: ["audit"],
    root: tmp(),
    concurrency: 1,
    deps,
    // Cancel after the first page has begun.
    shouldCancel: () => started >= 1,
  });

  assert.equal(report.status, "cancelled", "a cancelled run must not be reported as partial");
  assert.ok(report.pages.length < 6, "cancellation should have stopped new work");
  assert.equal(report.failures.length, 0, "skipped pages are not failures");
});

test("the probes stage writes a probe set the test stage can actually read", async () => {
  // Regression: the pipeline wrote genProbes' WRAPPER instead of the inner probe
  // set, so probes.json had an object where the array belongs. runProbes only
  // rejects that at the test stage — after audit and generation are paid for.
  // A real 43-page run failed on every page this way.
  const root = tmp();
  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  const report = await runPipeline({
    target: await pageTarget(),
    stages: ["probes", "test"],
    root,
    deps: countingDeps(counts),
  });
  assert.equal(report.failures.length, 0, `test stage failed: ${JSON.stringify(report.failures)}`);

  const written = JSON.parse(
    fs.readFileSync(path.join(report.outRoot, "pages", report.pages[0].key, "probes.json"), "utf8"),
  );
  assert.ok(Array.isArray(written.probes), "probes.json must hold an array under `probes`");
  assert.ok(written.probes.length > 0);
});

test("a malformed probe set is not silently reused", async () => {
  const root = tmp();
  const target = await pageTarget();
  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  const broken = {
    ...countingDeps(counts),
    // Emulates the old bug: valid JSON, no usable probes.
    genProbes: async () => {
      counts.probes++;
      return { probes: { probes: [] }, page: {} };
    },
  };
  const first = await runPipeline({ target, stages: ["probes"], root, deps: broken });
  assert.equal(first.pages.length, 1);

  // A second run must REGENERATE rather than reuse the unusable set.
  const second = { extract: 0, audit: 0, probes: 0, test: 0 };
  await runPipeline({ target, stages: ["probes"], root, deps: countingDeps(second) });
  assert.equal(second.probes, 1, "an empty probe set must not count as complete");
});

test("`--stages test` carries a probe set forward from an earlier run", async () => {
  // A run that failed at the test stage has already PAID for its probes. Being
  // unable to grade them without regenerating would charge twice for the same
  // work — the exact situation after the wrapper bug.
  const root = tmp();
  const target = await pageTarget();

  const gen = { extract: 0, audit: 0, probes: 0, test: 0 };
  await runPipeline({ target, stages: ["probes"], root, deps: countingDeps(gen) });
  assert.equal(gen.probes, 1);

  const counts = { extract: 0, audit: 0, probes: 0, test: 0 };
  const report = await runPipeline({ target, stages: ["test"], root, deps: countingDeps(counts) });

  assert.equal(report.failures.length, 0, `test stage failed: ${JSON.stringify(report.failures)}`);
  assert.equal(counts.probes, 0, "it must reuse the probe set, not regenerate it");
  assert.equal(counts.test, 1, "and it must actually grade");
});

test("the projection a run leaves behind actually contains its breakdown", async () => {
  // Ordering regression: the pipeline used to project BEFORE writing
  // report.json, so every finished run appeared in the UI as "no breakdown
  // recorded" despite having recorded one. Asserting the file exists is not
  // enough — the assertion has to be on what the UI reads.
  const root = tmp();
  const report = await runPipeline({
    target: await pageTarget(),
    stages: ["audit", "probes", "test"],
    root,
    deps: countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 }),
  });

  const projected = JSON.parse(
    fs.readFileSync(path.join(root, "dashboard", "runs", `${report.runId}.json`), "utf8"),
  );
  assert.ok(projected.breakdown, "the projected run must carry its breakdown");
  assert.equal(projected.breakdown.pages.length, 1);
  assert.ok(projected.breakdown.pages[0].stages.audit, "per-page stage outcomes must survive projection");
  assert.ok(Number.isFinite(projected.breakdown.pages[0].durations.audit), "durations must survive projection");
});

test("model defaults are resolved by the pipeline, not left to the caller", async () => {
  // The server omitted them, so every UI-started run hit the API with no model
  // and failed the entire test stage with "model: Field required".
  const seen = {};
  const base = countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 });
  const deps = {
    ...base,
    runAudit: async (args) => {
      seen.analyst = args.model;
      return base.runAudit(args);
    },
    runProbes: async (args) => {
      seen.probe = args.model;
      seen.grader = args.graderModel;
      return base.runProbes(args);
    },
  };

  // Deliberately passing NO model options, as the server did.
  await runPipeline({
    target: await pageTarget(),
    stages: ["audit", "probes", "test"],
    root: tmp(),
    deps,
  });

  for (const [role, value] of Object.entries(seen)) {
    assert.ok(value, `${role} model must not be undefined`);
    assert.match(value, /^claude-/, `${role} model looks wrong: ${value}`);
  }
});

test("a run records what it actually cost, not zero", async () => {
  // The manifest called tally.total(), which does not exist — the tally exposes
  // summary(). Every run therefore reported itself free, which quietly defeats
  // the entire cost-transparency story.
  const root = tmp();
  const { createTally } = await import("../src/usage.js");
  const tally = createTally();

  const base = countingDeps({ extract: 0, audit: 0, probes: 0, test: 0 });
  const deps = {
    ...base,
    runAudit: async (args) => {
      args.tally?.add("audit", "claude-opus-4-8", { input_tokens: 10_000, output_tokens: 2_000 });
      return base.runAudit(args);
    },
    runProbes: async () => ({
      probe_count: 1, graded_count: 1, refusal_count: 0, error_count: 0, results: [],
      model_tested: "claude-opus-4-8",
      grader_model: "claude-sonnet-5",
      usage: {
        model_under_test: { input_tokens: 50_000, output_tokens: 4_000 },
        grader: { input_tokens: 3_000, output_tokens: 1_000 },
      },
    }),
  };

  const report = await runPipeline({
    target: await pageTarget(),
    stages: ["audit", "probes", "test"],
    root,
    tally,
    deps,
  });

  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "runs", report.runId, "manifest.json"), "utf8"),
  );
  assert.ok(manifest.cost.measured > 0, `run reported ${manifest.cost.measured}`);
  // The test stage dominates, so its cost must be included — it is not in the
  // tally, because runProbes takes no tally.
  assert.ok(report.probeCost > 0, "probe-run spend must be counted");
  assert.ok(manifest.cost.measured >= report.probeCost, "manifest must include probe spend");
});
