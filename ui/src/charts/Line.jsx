/**
 * Multi-segment line chart.
 *
 * Segments are NOT joined to each other. That is the whole reason this is
 * hand-rolled: a fidelity trend crossing a grader change must render as two
 * lines, because Sonnet grades ~12 points harsher than Opus and a continuous
 * line would show a model swap as a regression.
 *
 * Colours come from theme tokens via `currentColor` and CSS variables, never
 * hard-coded, so dark mode cannot break.
 */
export function Line({ segments = [], marks = [], height = 180, yLabel = "", format = (v) => v }) {
  const all = segments.flatMap((s) => s.points);
  if (!all.length) return <div className="state small">No points yet.</div>;

  const xs = all.map((p) => new Date(p.at).getTime());
  const ys = all.map((p) => p.value);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = 0, y1 = Math.max(100, Math.ceil(Math.max(...ys) / 10) * 10);
  const w = 720, h = height, pad = { l: 38, r: 12, t: 12, b: 26 };

  const sx = (t) => pad.l + ((x1 === x0 ? 0.5 : (t - x0) / (x1 - x0))) * (w - pad.l - pad.r);
  const sy = (v) => h - pad.b - ((v - y0) / (y1 - y0)) * (h - pad.t - pad.b);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={yLabel || "trend"}>
      {[0, 25, 50, 75, 100].filter((v) => v <= y1).map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth="1" />
          <text x={4} y={sy(v) + 4} fontSize="11" fill="var(--faint)">{v}</text>
        </g>
      ))}

      {marks.map((m, i) => (
        <g key={i}>
          <line
            x1={sx(new Date(m.at).getTime())} x2={sx(new Date(m.at).getTime())}
            y1={pad.t} y2={h - pad.b}
            stroke="var(--warn)" strokeWidth="1" strokeDasharray="3 3"
          />
          <title>{m.reason}</title>
        </g>
      ))}

      {segments.map((seg, i) => {
        const d = seg.points
          .map((p, j) => `${j ? "L" : "M"}${sx(new Date(p.at).getTime())},${sy(p.value)}`)
          .join(" ");
        return (
          <g key={i} style={{ color: seg.protocolKnown ? "var(--accent)" : "var(--faint)" }}>
            <path d={d} fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray={seg.protocolKnown ? undefined : "4 3"} />
            {seg.points.map((p, j) => (
              <circle key={j} cx={sx(new Date(p.at).getTime())} cy={sy(p.value)} r="3" fill="currentColor">
                <title>{`${format(p.value)} — ${new Date(p.at).toLocaleDateString()}${seg.graderModel ? ` (${seg.graderModel})` : ""}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
