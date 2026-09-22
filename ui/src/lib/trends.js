// Client-side mirror of src/store/timeseries.js segmentation.
//
// Kept in the UI as well as the store because the static export has no server
// to ask: the rules that a line must never cross a grader change, and never
// join two different targets, have to hold in the published artifact too.

/**
 * Split points into segments that may be drawn as connected lines.
 *
 * Two things break a line, both learned from real data:
 *
 *   1. A different TARGET. A point's denominator is its target, so a ten-page
 *      average and a one-page average are different populations; joining them
 *      reads as a quality change that never happened.
 *   2. A different protocol fingerprint. Sonnet grades ~12 points harsher than
 *      Opus, so a line across a grader swap shows a model change as a trend.
 *
 * Grouping by target happens FIRST — walking one globally time-sorted list lets
 * a point from another target land mid-series and split it in two.
 */
export function segmentsFor(points, field = "fidelity") {
  const byTarget = new Map();
  for (const p of points) {
    if (p[field] === null || p[field] === undefined) continue;
    if (!byTarget.has(p.target)) byTarget.set(p.target, []);
    byTarget.get(p.target).push(p);
  }

  const segments = [];
  for (const group of byTarget.values()) {
    const usable = [...group].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    let current = null;
    for (const p of usable) {
      const key = `${p.target}::${p.protocolKnown ? p.fingerprint : `unknown:${p.runId}`}`;
      if (!current || current.fingerprint !== key) {
        current = {
          fingerprint: key,
          target: p.target,
          graderModel: p.graderModel,
          protocolKnown: p.protocolKnown,
          points: [],
        };
        segments.push(current);
      }
      current.points.push({ at: p.at, value: p[field] });
    }
  }
  return segments;
}

/** Protocol changes within one target, marked rather than smoothed over. */
export function discontinuities(points) {
  const byTarget = new Map();
  for (const p of points) {
    if (!byTarget.has(p.target)) byTarget.set(p.target, []);
    byTarget.get(p.target).push(p);
  }

  const marks = [];
  for (const group of byTarget.values()) {
    const sorted = [...group].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].fingerprint !== sorted[i - 1].fingerprint) {
        marks.push({
          at: sorted[i].at,
          reason:
            sorted[i].graderModel !== sorted[i - 1].graderModel
              ? `grader changed: ${sorted[i - 1].graderModel} → ${sorted[i].graderModel}`
              : "protocol changed",
        });
      }
    }
  }
  return marks;
}
