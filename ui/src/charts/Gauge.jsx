/**
 * A single measure, as a ring.
 *
 * Deliberately one measure per gauge. Two of these sit side by side on the
 * Overview because page quality and measured fidelity are different things —
 * a pre-registered study found structural score does not predict fidelity, so
 * one combined ring would draw a relationship the evidence disproves. Showing
 * them as twins makes that separation visible rather than stated in a footnote.
 */

const BANDS = [
  [85, "var(--band-exemplary)"],
  [70, "var(--band-strong)"],
  [55, "var(--band-good)"],
  [40, "var(--band-developing)"],
  [0, "var(--band-poor)"],
];

export const bandColour = (v) =>
  v === null || v === undefined ? "var(--faint)" : BANDS.find(([min]) => v >= min)[1];

export function Gauge({ value, label, unit = "out of 100", size = 172, stroke = 12, stats = [], caveat }) {
  const has = value !== null && value !== undefined && Number.isFinite(value);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Leave a gap at the bottom: a full ring reads as a loading spinner, an
  // interrupted one reads as a dial.
  const sweep = 0.78;
  const arc = c * sweep;
  const filled = has ? arc * Math.min(1, Math.max(0, value / 100)) : 0;

  return (
    <div className="gauge">
      <div className="gauge-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${label}: ${has ? Math.round(value) : "not measured"}`}>
          {/* Rotated so the gap sits at the bottom centre. */}
          <g transform={`rotate(${90 + (1 - sweep) * 180} ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke="var(--track)" strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${arc} ${c}`}
            />
            <circle
              className="gauge-arc"
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={bandColour(value)} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${arc} ${c}`}
              strokeDashoffset={arc - filled}
            />
          </g>
        </svg>
        <div className="gauge-center">
          <div className="gauge-value" style={{ color: has ? "var(--text)" : "var(--faint)" }}>
            {has ? value.toFixed(1) : "—"}
          </div>
          <div className="gauge-unit">{has ? unit : "not measured"}</div>
        </div>
      </div>

      <div className="gauge-label">{label}</div>

      {stats.length ? (
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={s.tone ? { color: s.tone } : undefined}>{s.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {caveat ? <div className="small faint" style={{ textAlign: "center", maxWidth: 240 }}>{caveat}</div> : null}
    </div>
  );
}
