/**
 * The nine rubric dimensions, ordered by what they cost.
 *
 * The previous version drew a bar chart of scores and, beneath it, a stack of
 * disclosures repeating the same names. Two problems:
 *
 *   1. Score is not the actionable number. A dimension is worth `weight` points
 *      of the 100, so a gap costs `weight x (10 - score) / 10`. A 3/10 on
 *      weight 12 costs 8.4 points; the same 3/10 on weight 8 costs 5.6. The
 *      chart showed both as equally short bars and left the reader to do the
 *      arithmetic that decides what to fix first.
 *   2. Nine bars plus nine disclosures is a lot of furniture for nine numbers.
 *
 * So: one row per dimension, sorted by points recoverable, with the score as a
 * ten-segment strip — discrete, readable without an axis, and a fraction of the
 * ink of a bar chart.
 */

/** What closing this gap is worth, in points of the 100-point score. */
export function recoverablePoints(dimension) {
  const { score, weight } = dimension;
  if (!Number.isFinite(score) || !Number.isFinite(weight)) return 0;
  return Math.round(weight * ((10 - score) / 10) * 10) / 10;
}

import { useState } from "react";
import { Treemap } from "../charts/Treemap.jsx";
import { DimensionDialog } from "./DimensionDialog.jsx";

/** Most recoverable first — the order someone would actually work in. */
export function byOpportunity(dimensions = []) {
  return [...dimensions]
    .map((d) => ({ ...d, gain: recoverablePoints(d) }))
    .sort((a, b) => b.gain - a.gain || a.score - b.score);
}

/**
 * One graphic, not nine rows.
 *
 * Nine rows are still nine things to read, and the reader has to scan to find
 * the biggest — which is why this section got skipped. Area does that work
 * instead: the largest rectangle IS the answer to "what do I fix first".
 *
 * Everything else moves out of sight. The per-dimension critique sits behind a
 * single disclosure rather than nine, so the default state is one picture and
 * one sentence.
 */
export function Dimensions({ dimensions = [], showAnalysis = true, height = 300 }) {
  const [open, setOpen] = useState(null);
  const rows = byOpportunity(dimensions);
  if (!rows.length) return <div className="state small">No dimension scores.</div>;

  const total = rows.reduce((a, d) => a + d.gain, 0);
  const top = rows[0];

  return (
    <div>
      <Treemap
        height={height}
        onSelect={(item) => setOpen(rows.find((d) => d.name === item.label) ?? null)}
        items={rows.map((d) => ({
          label: d.name,
          value: d.gain,
          detail: `${d.score}/10, weight ${d.weight}`,
        }))}
        emptyLabel="Nothing recoverable — every dimension is at full marks."
      />

      {/* One sentence, not a legend. It names the biggest box and the total, and
          the rest of the picture explains itself. */}
      <p className="small muted" style={{ marginTop: "var(--s3)" }}>
        Area is points recoverable — a dimension's weight × the share still missing.{" "}
        <strong>{total.toFixed(1)} of 100</strong> are available, most of them in{" "}
        <strong>{top.name.toLowerCase()}</strong> ({top.score}/10, weight {top.weight}).{" "}
        {showAnalysis ? "Select any tile for the auditor's reasoning." : null}
      </p>

      {showAnalysis ? <DimensionDialog dimension={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
