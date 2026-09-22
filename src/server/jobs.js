// Job lifecycle for runs started from the browser.
//
// Runs are long — measured web probe runs took 685-2,360 seconds, and batch
// grading adds more — so nothing here is request/response. A job is started,
// its state lives on disk, and the client polls.
//
// State on disk rather than in memory is deliberate: a server restart must not
// lose a 40-minute run, and a poll after a restart must still return the truth.

import { runPipeline } from "../run/pipeline.js";
import { resolveTarget } from "../target/index.js";
import { estimateRun, ALL_STAGES, ceilingFromEnv } from "../run/estimate.js";
import fs from "node:fs";
import path from "node:path";
import { listRuns, readManifest, writeManifest, reconcileInterrupted, ownerAlive, runDir } from "../store/run.js";
import { redact } from "./redact.js";

const DEFAULT_MAX_CONCURRENT_RUNS = 1;

export class JobManager {
  /**
   * @param {object} opts
   * @param {string} opts.root results directory
   * @param {number} opts.maxConcurrentRuns capped across RUNS, not just pages —
   *   otherwise N parallel runs each pass the per-run ceiling and collectively
   *   blow far past it.
   */
  constructor({ root = "results", maxConcurrentRuns = DEFAULT_MAX_CONCURRENT_RUNS, env = process.env, runner = runPipeline } = {}) {
    this.root = root;
    this.maxConcurrentRuns = maxConcurrentRuns;
    this.env = env;
    this.runner = runner;
    /** @type {Map<string, {progress: object, cancelled: boolean}>} */
    this.live = new Map();
    // Anything left mid-flight by a dead process is marked interrupted, never
    // auto-resumed: resuming without a human risks paying twice.
    this.interrupted = reconcileInterrupted(root);
  }

  activeCount() {
    return [...this.live.values()].filter((j) => !j.done).length;
  }

  /** Resolve + project cost without making a single Anthropic call. */
  async estimate({ target: spec, stages = ALL_STAGES, probesPerPage = 6, mode = "web", origin, productScope }) {
    const target = await resolveTarget(spec, { origin, productScope });
    const estimate = estimateRun({ pageCount: target.pages.length, stages, probesPerPage, mode });
    return { target, estimate };
  }

  /**
   * Start a run.
   *
   * The ceiling is enforced HERE, server-side. A client cannot raise it, and a
   * projection above it is refused without an explicit confirm — so a stray
   * click cannot spend the $250 a full-site sweep costs.
   */
  async start({ target: spec, stages = ALL_STAGES, probesPerPage = 6, mode = "web", confirm = false, origin, productScope, ...rest }) {
    if (this.activeCount() >= this.maxConcurrentRuns) {
      const err = new Error(`already running ${this.activeCount()} run(s); limit is ${this.maxConcurrentRuns}`);
      err.status = 409;
      throw err;
    }

    const { target, estimate } = await this.estimate({ target: spec, stages, probesPerPage, mode, origin, productScope });
    const ceiling = ceilingFromEnv(this.env);
    if (estimate.total > ceiling && !confirm) {
      const err = new Error(
        `projected $${estimate.total.toFixed(2)} exceeds the $${ceiling.toFixed(2)} ceiling — confirm to proceed`,
      );
      err.status = 400;
      err.detail = { projected: estimate.total, ceiling, requiresConfirm: true };
      throw err;
    }

    const job = {
      done: false,
      cancelled: false,
      startedAtMs: Date.now(),
      concurrency: rest.concurrency ?? 3,
      durations: [],
      progress: {
        status: "running",
        stage: stages[0] ?? null,
        pages: { complete: 0, failed: 0, total: target.pages.length },
        recent: [],
        cost: { spent: 0, projected: estimate.total },
        startedAt: new Date().toISOString(),
      },
    };

    const promise = this.runner({
      target,
      stages,
      probesPerPage,
      mode,
      root: this.root,
      ...rest,
      shouldCancel: () => job.cancelled,
      log: (line) => {
        const text = redact(String(line), this.env).trim();
        if (!text) return;
        job.progress.recent.unshift({ at: new Date().toISOString(), line: text });
        job.progress.recent = job.progress.recent.slice(0, 20);
      },
      onPage: (rec) => {
        if (rec.ok) job.progress.pages.complete++;
        else job.progress.pages.failed++;
        if (Number.isFinite(rec.elapsedMs)) job.durations.push(rec.elapsedMs);
        Object.assign(job.progress, etaFrom(job));
      },
    })
      .then((report) => {
        job.runId = report.runId;
        job.progress.status = job.cancelled ? "cancelled" : report.status;
        job.progress.pages.complete = report.pages.length;
        job.progress.pages.failed = report.failures.length;
        job.report = report;
        return report;
      })
      .catch((err) => {
        job.progress.status = "failed";
        job.progress.error = redact(err?.message ?? String(err), this.env);
      })
      .finally(() => {
        job.done = true;
        job.progress.endedAt = new Date().toISOString();
      });

    job.promise = promise;
    // A placeholder id until the pipeline mints the real one, so the client has
    // something to poll immediately.
    const handle = `job-${Date.now().toString(36)}`;
    job.handle = handle;
    this.live.set(handle, job);
    return { handle, estimate, pageCount: target.pages.length };
  }

  /**
   * Cancel a run.
   *
   * Resolves promptly and does NOT block on an in-flight grading batch, which
   * can poll for up to 24h. Money already committed to a submitted batch stays
   * committed; the run simply stops taking on new work.
   */
  cancel(handle) {
    const job = this.live.get(handle);
    if (!job) return false;
    job.cancelled = true;
    job.progress.status = "cancelling";
    return true;
  }

  status(handle) {
    const job = this.live.get(handle);
    if (!job) return null;
    return { handle, runId: job.runId ?? null, ...job.progress };
  }

  /**
   * Everything running right now, from any process.
   *
   * A run started at the terminal is not in this server's memory, so listing
   * only in-memory jobs shows an idle dashboard while the machine is busy
   * spending money. On-disk runs whose owning process is still alive are
   * included, with progress counted from the artifacts they have written.
   */
  active() {
    const out = [];
    const seen = new Set();

    for (const [handle, job] of this.live) {
      if (job.done) continue;
      out.push({ handle, source: "server", runId: job.runId ?? null, ...job.progress });
      if (job.runId) seen.add(job.runId);
    }

    for (const m of listRuns(this.root)) {
      if (m.status !== "running" && m.status !== "queued") continue;
      if (seen.has(m.runId)) continue;
      // Only genuinely live ones: a stale `running` manifest from a crash is
      // not activity, and reconciliation will retire it.
      if (ownerAlive(m) !== true) continue;
      out.push({
        handle: m.runId,
        source: "external",
        runId: m.runId,
        status: m.status,
        target: m.target,
        stages: m.stages,
        startedAt: m.startedAt,
        elapsedMs: Date.now() - new Date(m.startedAt).getTime(),
        pages: this.diskProgress(m),
      });
    }

    return out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }

  /** Pages finished, counted from what a run has actually written. */
  diskProgress(manifest) {
    const pagesDir = path.join(runDir(this.root, manifest.runId), "pages");
    let complete = 0;
    try {
      for (const key of fs.readdirSync(pagesDir)) {
        // stage-state.json is written once a page has been through its stages.
        if (fs.existsSync(path.join(pagesDir, key, "stage-state.json"))) complete++;
      }
    } catch {
      /* the directory may not exist yet */
    }
    return { complete, failed: 0, total: manifest.counts?.expected ?? 0 };
  }

  history() {
    return listRuns(this.root).map((m) => ({
      runId: m.runId,
      target: m.target,
      status: m.status,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      counts: m.counts,
      cost: m.cost,
      graderModel: m.protocol?.graderModel ?? null,
    }));
  }

  run(runId) {
    return readManifest(this.root, runId);
  }
}

/**
 * Project a finish time from the pages already done.
 *
 * Deliberately naive and labelled as such: it assumes the remaining pages
 * behave like the completed ones, which is wrong when stages differ in cost or
 * a grading batch is queued behind them. It is a guide, not a promise — hence
 * `basis`, so the UI can say what the number is built on.
 */
export function etaFrom(job) {
  const done = job.durations.length;
  const total = job.progress.pages.total;
  const remaining = Math.max(0, total - job.progress.pages.complete - job.progress.pages.failed);
  const elapsedMs = Date.now() - job.startedAtMs;

  if (!done || !remaining) {
    return { elapsedMs, etaMs: null, etaBasis: done ? "finishing" : "not enough data yet" };
  }
  const meanMs = job.durations.reduce((a, b) => a + b, 0) / done;
  // Pages run concurrently, so wall time for the remainder is the serial
  // estimate divided by how many run at once.
  const lanes = Math.max(1, Math.min(job.concurrency, remaining));
  return {
    elapsedMs,
    etaMs: Math.round((remaining * meanMs) / lanes),
    etaBasis: `mean ${Math.round(meanMs / 1000)}s over ${done} page(s), ${lanes} at a time`,
  };
}

export { writeManifest };
