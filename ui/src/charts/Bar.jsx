/**
 * Horizontal bars. Covers distribution, comparison, coverage and fix-backlog —
 * which is why there are only two chart primitives rather than five.
 *
 * Every bar shows its value as text: a length alone is not readable and does
 * not survive a greyscale print.
 */
export function Bar({ items = [], max, format = (v) => v, emptyLabel = "Nothing to show." }) {
  if (!items.length) return <div className="state small">{emptyLabel}</div>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);

  return (
    <div role="list">
      {items.map((item) => (
        <div key={item.label} role="listitem" style={{ margin: "8px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
            <span>{item.label}</span>
            <span className="muted">{format(item.value)}{item.note ? <span className="faint"> · {item.note}</span> : null}</span>
          </div>
          <div style={{ background: "var(--track)", borderRadius: 4, height: 8, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(1, (item.value / top) * 100)}%`,
                height: "100%",
                background: item.color ?? "var(--accent)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export const BAND_COLOURS = {
  Poor: "var(--band-poor)",
  Developing: "var(--band-developing)",
  Good: "var(--band-good)",
  Strong: "var(--band-strong)",
  Exemplary: "var(--band-exemplary)",
};
