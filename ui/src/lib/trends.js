// Client-side mirror of src/store/timeseries.js segmentation.
//
// Kept in the UI as well as the store because the static export has no server
// to ask: the rule that a line must never cross a grader change has to hold in
// the published artifact too.

export function segmentsFor(points, field = "fidelity") {
  const usable = points
    .filter((p) => p[field] !== null && p[field] !== undefined)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  const segments = [];
  let current = null;
  for (const p of usable) {
    const key = p.protocolKnown ? p.fingerprint : `unknown:${p.runId}`;
    if (!current || current.fingerprint !== key) {
      current = {
        fingerprint: key,
        graderModel: p.graderModel,
        protocolKnown: p.protocolKnown,
        points: [],
      };
      segments.push(current);
    }
    current.points.push({ at: p.at, value: p[field] });
  }
  return segments;
}

export function discontinuities(points) {
  const sorted = [...points].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const marks = [];
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
  return marks;
}
