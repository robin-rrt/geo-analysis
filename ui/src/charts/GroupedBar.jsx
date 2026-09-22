/**
 * Two measures per row, side by side.
 *
 * Deliberately two bars and never one combined bar: a pre-registered study
 * found structural score does not predict answer fidelity, so a composite would
 * draw a relationship the evidence does not support.
 *
 * A row with no second measure shows a stated absence rather than a zero-length
 * bar — "not probed" and "answers badly" are different facts and must not look
 * alike.
 */
export function GroupedBar({ rows = [], series, max = 100, emptyLabel = "Nothing to show." }) {
  if (!rows.length) return <div className="state small">{emptyLabel}</div>;

  return (
    <div role="list">
      <div className="small faint" style={{ display: "flex", gap: 14, marginBottom: 8 }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
      </div>

      {rows.map((row) => (
        <div key={row.label} role="listitem" style={{ margin: "10px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{row.label}</span>
            <span className="muted">{row.note}</span>
          </div>
          {series.map((s) => {
            const v = row[s.key];
            const has = v !== null && v !== undefined;
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ flex: 1, background: "var(--track)", borderRadius: 4, height: 7, overflow: "hidden" }}>
                  {has ? (
                    <div style={{ width: `${Math.max(1, (v / max) * 100)}%`, height: "100%", background: s.color }} />
                  ) : null}
                </div>
                <span className="small" style={{ width: 96, textAlign: "right", color: has ? "var(--text)" : "var(--faint)" }}>
                  {has ? Math.round(v) : s.absentLabel ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
