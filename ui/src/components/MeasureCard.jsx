/**
 * One headline measure, with its provenance.
 *
 * Deliberately NOT a composite. A pre-registered study (n=10) found structural
 * score does not predict answer fidelity (r = -0.073, p = .84), so combining
 * them into one "GEO score" would assert exactly the link the evidence does not
 * support. Two cards, side by side, each saying what it measures.
 */
export function MeasureCard({ label, value, unit = "/100", delta, provenance, description, denominator }) {
  const has = value !== null && value !== undefined;
  return (
    <div className="card">
      <div className="muted small">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 0 2px" }}>
        <span style={{ fontSize: 30, fontWeight: 600 }}>{has ? Math.round(value) : "—"}</span>
        {has ? <span className="faint">{unit}</span> : null}
        {delta !== null && delta !== undefined && Number.isFinite(delta) ? (
          <span className="small" style={{ color: delta >= 0 ? "var(--ok)" : "var(--sev-high)" }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
          </span>
        ) : null}
      </div>
      {denominator ? <div className="small faint">{denominator}</div> : null}
      {provenance ? <div className="small muted">{provenance}</div> : null}
      {description ? <div className="small faint" style={{ marginTop: 6 }}>{description}</div> : null}
    </div>
  );
}
