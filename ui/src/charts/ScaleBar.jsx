import { bandColour, bandName, THRESHOLDS } from "../lib/bands.js";

/**
 * A figure and where it sits on the 0–100 scale.
 *
 * Chosen over a ring because a ring shows magnitude and nothing else. What a
 * reader actually needs is position relative to the band thresholds — 57 and 69
 * are both "Good", but one is a point from dropping a band and the other is a
 * point from climbing one. The ticks make that visible; an arc cannot.
 */
export function ScaleBar({ value, label, meta, sub, delta }) {
  const has = value !== null && value !== undefined && Number.isFinite(value);
  const pos = has ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div className="measure">
      <div className="measure-label">{label}</div>

      <div className="measure-figure" style={{ color: has ? "var(--text)" : "var(--faint)" }}>
        {has ? value.toFixed(1) : "—"}
        {has ? <span className="measure-of">/100</span> : <span className="measure-of">not measured</span>}
      </div>

      <div className="scale" aria-hidden={!has}>
        <div className="scale-rule" />
        {/* Band boundaries, so a score can be read against the rubric rather
            than against an absolute length. */}
        {THRESHOLDS.filter((b) => b.min > 0).map((b) => (
          <span key={b.min} className="scale-tick" style={{ left: `${b.min}%` }} />
        ))}
        {has ? (
          <span className="scale-marker" style={{ left: `${pos}%`, background: bandColour(value) }} />
        ) : null}
      </div>

      <div className="scale-legend">
        {THRESHOLDS.filter((b) => b.min > 0).map((b) => (
          <span key={b.min} style={{ left: `${b.min}%` }}>{b.min}</span>
        ))}
      </div>

      <div className="measure-meta">
        {has ? (
          <span style={{ color: bandColour(value), fontWeight: 600 }}>{bandName(value)}</span>
        ) : null}
        {meta ? <span>{meta}</span> : null}
        {delta !== null && delta !== undefined && Number.isFinite(delta) ? (
          <span style={{ color: Math.abs(delta) < 1 ? "var(--faint)" : delta > 0 ? "var(--ok)" : "var(--sev-high)" }}>
            {delta >= 0 ? "+" : "−"}{Math.abs(delta).toFixed(1)} since last run
          </span>
        ) : null}
      </div>

      {sub ? <div className="measure-sub">{sub}</div> : null}
    </div>
  );
}
