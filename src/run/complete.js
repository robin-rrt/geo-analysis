// When is a stage actually finished?
//
// This has been got wrong twice, in both directions, so it lives in one tested
// place rather than inline at the call site:
//
//   "file exists"                 — wrong. A probe run writes its answers before
//                                   the grading batch returns, so the file is
//                                   there while the grades are not.
//   `graded_count > 0`            — wrong. Marks a page done when 1 of 6 graded.
//   `graded === probe_count`      — wrong. Refusals and errors are legitimately
//                                   ungraded (evaluate.js:555), so a run with one
//                                   refusal would never be considered finished.
//
// The predicate is: every probe reached a terminal state, and none of those
// states was a retryable error.

import fs from "node:fs";

/** A refusal is terminal — the model declined, re-asking burns money for the same answer. */
export function probeRunStatus(run) {
  if (!run || typeof run !== "object") return { settled: false, complete: false, reason: "unreadable" };
  const total = run.probe_count ?? (run.results ?? []).length;
  if (!total) return { settled: false, complete: false, reason: "no probes" };

  const graded = run.graded_count ?? 0;
  const refusals = run.refusal_count ?? 0;
  const errors = run.error_count ?? 0;
  const settled = graded + refusals + errors === total;

  return {
    settled,
    // Errors are transport failures, not verdicts — a run carrying them is
    // resumable work, not finished work.
    complete: settled && errors === 0,
    graded,
    refusals,
    errors,
    total,
    reason: !settled
      ? `only ${graded + refusals + errors} of ${total} probes settled`
      : errors
        ? `${errors} retryable error(s)`
        : null,
  };
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** Is a probe-run artifact on disk complete? */
export function probeRunFileComplete(file) {
  if (!fs.existsSync(file)) return false;
  return probeRunStatus(readJson(file)).complete;
}

/**
 * Has a stage's input changed since it last ran?
 *
 * A page audited at t=0 and probed at t=40min may have been edited in between,
 * which would score an answer against text nobody is serving any more. Each
 * stage records the hash of what it consumed; a moved hash means re-run.
 */
export function inputUnchanged(recordedHash, currentHash) {
  if (!recordedHash || !currentHash) return false; // unknown provenance — re-run
  return recordedHash === currentHash;
}

/**
 * A probe set is complete only if it actually holds probes.
 *
 * Parseable-JSON was not enough: a malformed set written by an earlier bug is
 * valid JSON, so a resumed run reused it and failed again at the test stage —
 * after paying for the audit and the generation. Shape is the contract.
 */
export function probeSetComplete(file) {
  if (!fs.existsSync(file)) return false;
  const set = readJson(file);
  return Array.isArray(set?.probes) && set.probes.length > 0;
}

/** A non-probe artifact (audit, probes.json) is complete when it exists and parses. */
export function artifactComplete(file, { requireJson = false } = {}) {
  if (!fs.existsSync(file)) return false;
  if (!requireJson) return fs.statSync(file).size > 0;
  return readJson(file) !== null;
}
