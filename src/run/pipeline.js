// Stage sequencing for `geo-audit run`.
//
// Extends what cmdProduct already does rather than reimplementing it: page
// fetching, the ledger and the rollup all come from src/product/. What is new
// here is stage selection, resume, per-page isolation and cost accounting
// across an arbitrary target rather than only a product.
//
// Two rules the whole file exists to enforce:
//
//   1. A page that fails does not abort the run. One 404 in a 31-page product
//      must not discard 30 pages of paid work.
//   2. Nothing paid is repeated. Resume decisions are made from artifact
//      CONTENT (src/run/complete.js), never from a file's existence, and a
//      stage whose input hash moved is re-run rather than trusted.

import fs from "node:fs";
import path from "node:path";
import { extractPage, buildPageContent } from "../extract.js";
import { runAudit } from "../analyze.js";
import { genProbes, slugFromUrl } from "../probes.js";
import { runProbes } from "../evaluate.js";
import { hashOf } from "../product/fetch.js";
import { rollup } from "../product/rollup.js";
import { ALL_STAGES } from "./estimate.js";
import { probeRunFileComplete, artifactComplete, inputUnchanged } from "./complete.js";
import { pageKey, assertUniqueKeys } from "../store/slug.js";
import {
  newRunId, createManifest, writeManifest, listRuns, runDir, protocolFingerprint, runHealth,
} from "../store/run.js";
import { project } from "../store/project.js";

const DEFAULT_CONCURRENCY = 3;

const readJsonOrNull = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** Write via temp+rename so a crash mid-write cannot leave a torn artifact. */
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** Capped-concurrency map that never rejects: every result is captured. */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = { ok: true, value: await fn(items[i], i) };
        } catch (err) {
          results[i] = {
            ok: false,
            error: err?.message ?? String(err),
            skippedByCancel: Boolean(err?.cancelled),
          };
        }
      }
    }),
  );
  return results;
}

/** Where a page's artifacts live inside a run snapshot. Full-path key: the old
 * last-two-segments slug collides across products (ccip/ and vrf/ both yield
 * `getting-started-evm`), which in a shared namespace serves one product's page
 * as another's. */
export function pageDir(runRoot, url) {
  return path.join(runRoot, "pages", pageKey(url));
}

/**
 * Find a completed artifact for this page in an EARLIER run.
 *
 * Resume across immutable runs works by copying forward, not by re-paying and
 * not by mutating history: if a previous run produced this artifact from the
 * same input, it is copied into the new run so every run directory stays
 * self-contained and independently readable.
 */
function findReusable(root, key, file, { contentHash, validate }) {
  for (const m of listRuns(root)) {
    const candidate = path.join(runDir(root, m.runId), "pages", key, file);
    if (!fs.existsSync(candidate)) continue;
    const state = readJsonOrNull(path.join(runDir(root, m.runId), "pages", key, "stage-state.json"));
    const recorded = state?.[file] ?? null;
    if (contentHash && !inputUnchanged(recorded?.contentHash, contentHash)) continue;
    if (validate && !validate(candidate)) continue;
    return candidate;
  }
  return null;
}

function copyForward(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

/** Per-page record of what each stage consumed, so resume can detect drift. */
function readState(dir) {
  const f = path.join(dir, "stage-state.json");
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return {};
  }
}

function writeState(dir, state) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "stage-state.json"), JSON.stringify(state, null, 2));
}

/**
 * Run the selected stages over a resolved target.
 *
 * `deps` exists so tests can count Anthropic calls without making any — the
 * "re-running does no paid work" criterion is only meaningful if it is measured.
 */
export async function runPipeline({
  target,
  stages = ALL_STAGES,
  root = "results",
  concurrency = DEFAULT_CONCURRENCY,
  probesPerPage = 6,
  mode = "web",
  model,
  effort = "high",
  probeModel,
  probeEffort = "medium",
  graderModel,
  batch = false,
  force = false,
  tally,
  log = () => {},
  onPage = () => {},
  shouldCancel = () => false,
  deps = {},
} = {}) {
  const api = {
    extractPage,
    buildPageContent,
    runAudit,
    genProbes,
    runProbes,
    ...deps,
  };

  // A key collision would serve one product's page as another's. Checked before
  // anything is written, so it fails before spending rather than after.
  assertUniqueKeys(target.pages.map((p) => p.url));

  const protocol = {
    analystModel: model ?? null,
    analystEffort: effort,
    graderModel: graderModel ?? null,
    probeModel: probeModel ?? null,
    probeEffort,
    mode,
    batch,
  };
  const runId = newRunId();
  const outRoot = runDir(root, runId);
  fs.mkdirSync(path.join(outRoot, "pages"), { recursive: true });

  let manifest = createManifest({
    runId,
    target: { type: target.type, name: target.name, productScope: target.productScope },
    stages,
    protocol,
  });
  manifest = writeManifest(root, { ...manifest, status: "running" });

  const report = {
    runId,
    target: manifest.target,
    stages,
    pages: [],
    failures: [],
    skipped: { audit: 0, probes: 0, test: 0 },
    reused: 0,
  };

  let cancelled = false;
  const pageResults = await pool(target.pages, concurrency, async (page) => {
    // Cancellation stops NEW work. A page already in flight finishes so its
    // artifact is not left half-written; nothing waits on a grading batch.
    if (shouldCancel()) {
      cancelled = true;
      const err = new Error("cancelled before this page started");
      err.cancelled = true;
      throw err;
    }
    const dir = pageDir(outRoot, page.url);
    fs.mkdirSync(dir, { recursive: true });
    const state = readState(dir);
    const record = { url: page.url, key: pageKey(page.url), slug: path.basename(dir), stages: {} };

    // --- extraction is shared by audit, probes and rollup; do it once --------
    let extracted = null;
    let content = null;
    let contentHash = null;
    const needsContent =
      stages.includes("audit") || stages.includes("probes") || stages.includes("rollup");
    if (needsContent) {
      extracted = await api.extractPage(page.url);
      content = api.buildPageContent(extracted, { facts: true });
      contentHash = hashOf(content);
      record.contentHash = contentHash;
      // rollup() consumes fetchProduct-shaped entries: `{ fetched, page }`.
      record.fetched = true;
      record.page = extracted;
    }

    // --- audit ---------------------------------------------------------------
    if (stages.includes("audit")) {
      const file = path.join(dir, "audit.md");
      const reusable = force
        ? null
        : findReusable(root, record.key, "audit.md", { contentHash, validate: (f) => artifactComplete(f) });
      if (reusable) {
        copyForward(reusable, file);
        state["audit.md"] = { contentHash, at: new Date().toISOString(), reusedFrom: reusable };
        record.stages.audit = "reused";
        report.skipped.audit++;
        report.reused++;
      } else {
        const md = await api.runAudit({ url: page.url, pageContent: content, model, effort, tally });
        fs.writeFileSync(file, md);
        state["audit.md"] = { contentHash, at: new Date().toISOString() };
        record.stages.audit = "ran";
      }
    }

    // --- probes --------------------------------------------------------------
    let probesFile = path.join(dir, "probes.json");
    if (stages.includes("probes")) {
      const reusable = force
        ? null
        : findReusable(root, record.key, "probes.json", {
            contentHash,
            validate: (f) => artifactComplete(f, { requireJson: true }),
          });
      if (reusable) {
        copyForward(reusable, probesFile);
        state["probes.json"] = { contentHash, at: new Date().toISOString(), reusedFrom: reusable };
        record.stages.probes = "reused";
        report.skipped.probes++;
        report.reused++;
      } else {
        const probes = await api.genProbes({
          url: page.url,
          page: extracted,
          n: probesPerPage,
          model,
          effort,
          tally,
        });
        fs.writeFileSync(probesFile, JSON.stringify(probes, null, 2));
        state["probes.json"] = { contentHash, at: new Date().toISOString() };
        record.stages.probes = "ran";
      }
    }

    // --- test ----------------------------------------------------------------
    if (stages.includes("test")) {
      if (!artifactComplete(probesFile, { requireJson: true })) {
        throw new Error("no probe set — run the probes stage first");
      }
      const out = path.join(dir, `probe-results-${mode}.json`);
      const reusable = force
        ? null
        : findReusable(root, record.key, `probe-results-${mode}.json`, {
            validate: (f) => probeRunFileComplete(f),
          });
      if (reusable) {
        copyForward(reusable, out);
        record.stages.test = "reused";
        report.skipped.test++;
        report.reused++;
      } else {
        // runProbes returns a summary; the caller owns the file. `previous`
        // is what makes a partially-graded run resume instead of re-paying.
        const summary = await api.runProbes({
          probesFile,
          model: probeModel,
          graderModel,
          mode,
          effort,
          probeEffort,
          batch,
          previous: force ? null : readJsonOrNull(out),
          onProgress: (partial) => writeJsonAtomic(out, partial),
        });
        writeJsonAtomic(out, summary);
        record.stages.test = "ran";
      }
    }

    writeState(dir, state);
    log(`  ok   ${record.slug}\n`);
    return record;
  });

  for (const [i, r] of pageResults.entries()) {
    if (r.ok) {
      report.pages.push(r.value);
      onPage({ ok: true, url: target.pages[i].url });
    } else if (r.skippedByCancel) {
      // Not a failure: nothing was attempted, so it must not count against the
      // run's health or turn a cancelled run into a "partial" one.
      report.cancelledPages = (report.cancelledPages ?? 0) + 1;
    } else {
      // Rule 1: a failed page is recorded, not fatal.
      report.failures.push({ url: target.pages[i].url, error: r.error });
      onPage({ ok: false, url: target.pages[i].url, error: r.error });
      log(`  FAIL ${target.pages[i].url} — ${r.error}\n`);
    }
  }

  // --- rollup ----------------------------------------------------------------
  if (stages.includes("rollup") && report.pages.length) {
    const view = rollupForTarget(target, report);
    fs.writeFileSync(path.join(outRoot, "rollup.json"), JSON.stringify(view, null, 2));
    report.rollup = { score: view.score, file: path.join(outRoot, "rollup.json") };
  }

  // The ledger is written for every target type, so "which pages were considered
  // and why was this one skipped" is always answerable.
  fs.writeFileSync(
    path.join(outRoot, "pages.json"),
    JSON.stringify(
      {
        target: report.target,
        counts: { ...target.counts, failed: report.failures.length },
        notes: target.notes,
        ledger: target.ledger,
        failures: report.failures,
      },
      null,
      2,
    ),
  );

  // The extracted page bodies were carried only so rollup could consume them.
  // Dropping them keeps the returned report small and JSON-safe.
  for (const p of report.pages) delete p.page;

  // partial, not complete: an average over the pages that happened to succeed is
  // a self-narrowed denominator, so a partial run must not post a trend point.
  const status = cancelled ? "cancelled" : report.failures.length ? "partial" : "complete";
  manifest = writeManifest(root, {
    ...manifest,
    status,
    endedAt: new Date().toISOString(),
    counts: { pages: report.pages.length, failed: report.failures.length },
    cost: { measured: tally?.total?.() ?? 0, currency: "USD" },
    protocolFingerprint: protocolFingerprint(protocol),
  });
  report.status = status;

  // dashboard/ is a pure projection and is rebuilt from runs/ every time.
  try {
    report.projection = project(root);
  } catch (err) {
    report.projectionError = err.message;
  }

  report.outRoot = outRoot;
  return report;
}

/**
 * Roll the per-page checks up to target level, reusing the product rollup.
 * `rollup()` already scores an arbitrary set of pages, so nothing target-specific
 * is needed here.
 */
function rollupForTarget(target, report) {
  const pages = report.pages.map((p) => ({
    url: p.url,
    fetched: Boolean(p.fetched),
    page: p.page ?? null,
  }));
  return rollup(target.name, target.productScope ?? target.type, pages);
}
