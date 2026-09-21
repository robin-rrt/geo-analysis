import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, LOOPBACK, DEFAULT_PORT } from "../src/server/index.js";
import { JobManager } from "../src/server/jobs.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "geo-server-"));
const KEY = "sk-ant-api03-PLANTEDKEYMATERIAL1234567890";

/** Start a server on an ephemeral port and return a fetch bound to it. */
async function withServer(opts, fn) {
  const server = createServer(opts);
  await new Promise((r) => server.listen(0, LOOPBACK, r));
  const base = `http://${LOOPBACK}:${server.address().port}`;
  try {
    return await fn((p, init) => fetch(`${base}${p}`, init), server);
  } finally {
    server.close();
  }
}

/** A job manager whose runner never touches the network. */
function fakeManager(root, { runner, env } = {}) {
  return new JobManager({
    root,
    env: env ?? { ANTHROPIC_API_KEY: KEY },
    runner:
      runner ??
      (async ({ target }) => ({
        runId: "run-1",
        status: "complete",
        pages: target.pages.map((p) => ({ url: p.url })),
        failures: [],
      })),
  });
}

test("the server binds loopback by default", () => {
  assert.equal(LOOPBACK, "127.0.0.1");
  assert.equal(DEFAULT_PORT, 4317);
});

test("health responds and reports reconciled runs", async () => {
  await withServer({ root: tmp(), jobs: fakeManager(tmp()) }, async (get) => {
    const res = await get("/api/health");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

test("the API key never appears in a response body, even when an error echoes it", async () => {
  const root = tmp();
  const manager = fakeManager(root, {
    // An upstream failure that embeds the key, which is exactly how keys leak.
    runner: async () => {
      throw new Error(`upstream rejected request with ${KEY}`);
    },
  });
  await withServer({ root, jobs: manager, env: { ANTHROPIC_API_KEY: KEY } }, async (get) => {
    const res = await get("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "page:https://docs.chain.link/ace", stages: ["audit"] }),
    });
    const text = await res.text();
    assert.ok(!text.includes("PLANTEDKEYMATERIAL"), `key leaked in response: ${text}`);

    // And again once the failure has settled into job status.
    const start = JSON.parse(text);
    if (start.handle) {
      await manager.live.get(start.handle)?.promise;
      const status = await (await get(`/api/runs/${start.handle}`)).text();
      assert.ok(!status.includes("PLANTEDKEYMATERIAL"), `key leaked in status: ${status}`);
    }
  });
});

test("a projection above the ceiling is refused without confirm, and the client cannot raise it", async () => {
  const root = tmp();
  const manager = new JobManager({
    root,
    env: { GEO_COST_CEILING: "0.01" }, // anything real exceeds this
    runner: async () => ({ runId: "r", status: "complete", pages: [], failures: [] }),
  });
  await withServer({ root, jobs: manager }, async (get) => {
    const body = { target: "page:https://docs.chain.link/ace", stages: ["audit"] };
    const refused = await get("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(refused.status, 400);
    const detail = await refused.json();
    assert.equal(detail.requiresConfirm, true);
    assert.equal(detail.ceiling, 0.01, "the ceiling is the server's, not the client's");

    // A client-supplied ceiling must be ignored.
    const spoofed = await get("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, ceiling: 9999, GEO_COST_CEILING: 9999 }),
    });
    assert.equal(spoofed.status, 400, "a client must not be able to raise the ceiling");

    // With explicit confirmation it proceeds.
    const confirmed = await get("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, confirm: true }),
    });
    assert.equal(confirmed.status, 200);
  });
});

test("estimate makes no Anthropic call and returns a projection", async () => {
  const root = tmp();
  await withServer({ root, jobs: fakeManager(root) }, async (get) => {
    const res = await get("/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "page:https://docs.chain.link/ace", stages: ["audit"] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pageCount, 1);
    assert.ok(body.estimate.total > 0);
  });
});

test("concurrent runs are capped across runs, not just pages", async () => {
  const root = tmp();
  let release;
  const gate = new Promise((r) => (release = r));
  const manager = new JobManager({
    root,
    env: {},
    maxConcurrentRuns: 1,
    runner: async ({ target }) => {
      await gate;
      return { runId: "r", status: "complete", pages: target.pages, failures: [] };
    },
  });
  await withServer({ root, jobs: manager }, async (get) => {
    const body = JSON.stringify({ target: "page:https://docs.chain.link/ace", stages: ["audit"] });
    const headers = { "content-type": "application/json" };
    const first = await get("/api/runs", { method: "POST", headers, body });
    assert.equal(first.status, 200);
    const second = await get("/api/runs", { method: "POST", headers, body });
    assert.equal(second.status, 409, "a second concurrent run must be refused");
    release();
  });
});

test("cancelling resolves immediately rather than blocking on the run", async () => {
  const root = tmp();
  let release;
  const gate = new Promise((r) => (release = r));
  const manager = new JobManager({
    root,
    env: {},
    runner: async ({ target }) => {
      await gate;
      return { runId: "r", status: "cancelled", pages: [], failures: [] };
    },
  });
  await withServer({ root, jobs: manager }, async (get) => {
    const started = await (
      await get("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: "page:https://docs.chain.link/ace", stages: ["audit"] }),
      })
    ).json();

    const t0 = Date.now();
    const res = await get(`/api/runs/${started.handle}/cancel`, { method: "POST" });
    // A grading batch can poll for up to 24h; cancel must not wait on it.
    assert.ok(Date.now() - t0 < 1000, "cancel blocked on the running job");
    assert.equal(res.status, 200);
    release();
  });
});

test("progress is pollable and reports pages and cost", async () => {
  const root = tmp();
  const manager = fakeManager(root);
  await withServer({ root, jobs: manager }, async (get) => {
    const started = await (
      await get("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: "page:https://docs.chain.link/ace", stages: ["audit"] }),
      })
    ).json();
    const status = await (await get(`/api/runs/${started.handle}`)).json();
    assert.ok(status.pages, "progress should report page counts");
    assert.ok(status.cost, "progress should report running cost");
    assert.equal(status.pages.total, 1);
  });
});

test("path traversal cannot escape the UI directory", async () => {
  const ui = tmp();
  fs.writeFileSync(path.join(ui, "index.html"), "<h1>ok</h1>");
  const secret = path.join(os.tmpdir(), "geo-should-not-serve.txt");
  fs.writeFileSync(secret, "TOPSECRET");
  await withServer({ root: tmp(), uiDir: ui, jobs: fakeManager(tmp()) }, async (get) => {
    const res = await get("/../geo-should-not-serve.txt");
    const text = await res.text();
    assert.ok(!text.includes("TOPSECRET"), "traversal escaped the UI directory");
  });
});

test("a missing projection reports why rather than 500ing", async () => {
  await withServer({ root: tmp(), jobs: fakeManager(tmp()) }, async (get) => {
    const res = await get("/api/dashboard/index");
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /run something first/);
  });
});

test("a run started elsewhere shows as active, so the dashboard is not idle while the machine works", async () => {
  // A run started at the terminal is not in this server's memory. Listing only
  // in-memory jobs showed an empty dashboard while a 43-page run was spending.
  const root = tmp();
  const { createManifest, writeManifest, newRunId, runDir } = await import("../src/store/run.js");
  const runId = newRunId();
  writeManifest(root, {
    ...createManifest({ runId, target: { type: "product", name: "cre" }, stages: ["test"], protocol: {} }),
    status: "running",
    counts: { expected: 43, pages: 0, failed: 0 },
  });
  // Two pages have finished their stages.
  for (const key of ["a", "b"]) {
    const d = path.join(runDir(root, runId), "pages", key);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "stage-state.json"), "{}");
  }

  const manager = new JobManager({ root, env: {}, runner: async () => ({}) });
  await withServer({ root, jobs: manager }, async (get) => {
    const { active } = await (await get("/api/active")).json();
    assert.equal(active.length, 1);
    assert.equal(active[0].source, "external", "a terminal-started run is not a server job");
    assert.equal(active[0].pages.total, 43);
    assert.equal(active[0].pages.complete, 2, "progress should come from what the run has written");
  });
});

test("a stale running manifest from a crash is not reported as activity", async () => {
  const root = tmp();
  const { createManifest, writeManifest, newRunId } = await import("../src/store/run.js");
  const runId = newRunId();
  writeManifest(root, {
    ...createManifest({ runId, target: { type: "page", name: "x" }, stages: ["audit"], protocol: {} }),
    status: "running",
    // A pid that cannot be alive.
    owner: { pid: 999999999, host: require("node:os").hostname() },
  });
  const manager = new JobManager({ root, env: {}, runner: async () => ({}) });
  await withServer({ root, jobs: manager }, async (get) => {
    const { active } = await (await get("/api/active")).json();
    assert.equal(active.length, 0, "a dead run is not activity");
  });
});
