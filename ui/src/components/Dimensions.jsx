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

/** Most recoverable first — the order someone would actually work in. */
export function byOpportunity(dimensions = []) {
  return [...dimensions]
    .map((d) => ({ ...d, gain: recoverablePoints(d) }))
    .sort((a, b) => b.gain - a.gain || a.score - b.score);
}

function Dots({ score }) {
  const filled = Math.round(Number.isFinite(score) ? score : 0);
  return (
    <div className="dim-dots" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`dim-dot${i < filled ? " on" : ""}`} />
      ))}
    </div>
  );
}

export function Dimensions({ dimensions = [], showAnalysis = true }) {
  const rows = byOpportunity(dimensions);
  if (!rows.length) return <div className="state small">No dimension scores.</div>;

  const total = rows.reduce((a, d) => a + d.gain, 0);

  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Ordered by points recoverable — weight × the share still missing.{" "}
        <strong>{total.toFixed(1)} points</strong> are available across all nine.
      </p>

      {rows.map((d) => {
        const body = (
          <div className="dim">
            <div>
              <div className="dim-name">{d.name}</div>
              <Dots score={d.score} />
            </div>
            <div className="dim-figures">
              <div className="dim-gain">+{d.gain.toFixed(1)}</div>
              {/* Score and weight are the inputs; the figure above is what they mean. */}
              <div className="dim-meta">{d.score}/10 · weight {d.weight}</div>
            </div>
          </div>
        );

        // The critique only appears where there is one, rather than a disclosure
        // per dimension whether or not it holds anything.
        return showAnalysis && d.analysis ? (
          <details className="item" key={d.name}>
            <summary>{body}</summary>
            <div className="dim-analysis">{d.analysis}</div>
          </details>
        ) : (
          <div key={d.name}>{body}</div>
        );
      })}
    </div>
  );
}
