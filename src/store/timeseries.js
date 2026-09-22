// Score and fidelity over time.
//
// Three rules, each of which exists because breaking it produces a chart that
// lies:
//
//   1. Only a `complete` run posts a point. A partial or cancelled run is an
//      average over the pages that happened to finish — a self-narrowed
//      denominator dressed up as a measurement.
//   2. Points are only joined within a matching protocol fingerprint. Sonnet
//      grades ~12 points harsher than Opus, so a line crossing a grader change
//      shows a 12-point "improvement" that is a model swap.
//   3. Structural score and fidelity are separate series and are never averaged
//      together. A 10-unit pre-registered study found structural score does not
//      predict fidelity (r = -0.073, p = .84); combining them asserts exactly
//      the link the evidence does not support.

import { RUN_STATUS, protocolFingerprint } from "./run.js";

/** May this run contribute a trend point? */
export function postsTrendPoint(manifest) {
  return Boolean(RUN_STATUS[manifest?.status]?.postsTrend);
}

/**
 * Build a point from a completed run. Returns null when the run must not post.
 *
 * `health` rides along so a degraded run is distinguishable on the chart rather
 * than silently averaged in with clean ones.
 */
export function buildPoint({ manifest, score = null, fidelity = null, health = null, coverage = null }) {
  if (!postsTrendPoint(manifest)) return null;
  return {
    runId: manifest.runId,
    at: manifest.endedAt ?? manifest.startedAt,
    target: `${manifest.target?.type}:${manifest.target?.name}`,
    // Separate series. Never combined.
    score,
    fidelity,
    graderModel: manifest.protocol?.graderModel ?? null,
    fingerprint: manifest.protocolFingerprint ?? protocolFingerprint(manifest.protocol),
    health,
    coverage,
    // Runs predating --probe-effort cannot have their protocol recovered. Saying
    // so is better than joining them to a line they do not belong on.
    protocolKnown: Boolean(manifest.protocol?.graderModel && manifest.protocol?.probeEffort),
  };
}

export function appendPoint(series, point) {
  if (!point) return series;
  const next = series.filter((p) => p.runId !== point.runId);
  next.push(point);
  next.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return next;
}

/**
 * Split a target's points into segments that may be drawn as connected lines.
 *
 * A new segment starts whenever the fingerprint changes or protocol provenance
 * is unknown, so the renderer cannot accidentally join across a grader swap.
 */
export function segmentsFor(points, { field = "fidelity" } = {}) {
  // Group by target FIRST. Walking one globally time-sorted list lets points
  // from another target land in the middle of this one and split it in two —
  // observed with real data, where a one-page run fragmented a ten-page series.
  const byTarget = new Map();
  for (const p of points) {
    if (p[field] === null || p[field] === undefined) continue;
    if (!byTarget.has(p.target)) byTarget.set(p.target, []);
    byTarget.get(p.target).push(p);
  }

  const segments = [];
  for (const group of byTarget.values()) {
    const usable = group.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    let current = null;
    for (const p of usable) {
    // Target is part of the key: a point's denominator is its target, so a
    // 10-page average and a 1-page average are different series, not two
    // points on one line.
      const key = `${p.target}::${p.protocolKnown ? p.fingerprint : `unknown:${p.runId}`}`;
      if (!current || current.fingerprint !== key) {
        current = { fingerprint: key, target: p.target, graderModel: p.graderModel, protocolKnown: p.protocolKnown, points: [] };
        segments.push(current);
      }
      current.points.push(p);
    }
  }
  return segments;
}

/** Where the protocol changed — rendered as a discontinuity, not smoothed over. */
export function discontinuities(points) {
  const sorted = [...points].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const marks = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].fingerprint !== sorted[i - 1].fingerprint) {
      marks.push({
        at: sorted[i].at,
        from: sorted[i - 1].fingerprint,
        to: sorted[i].fingerprint,
        reason:
          sorted[i].graderModel !== sorted[i - 1].graderModel
            ? `grader changed ${sorted[i - 1].graderModel} -> ${sorted[i].graderModel}`
            : "protocol changed",
      });
    }
  }
  return marks;
}

export function groupByTarget(points) {
  const byTarget = new Map();
  for (const p of points) {
    if (!byTarget.has(p.target)) byTarget.set(p.target, []);
    byTarget.get(p.target).push(p);
  }
  return byTarget;
}
