import { bandColour } from "../lib/bands.js";

/**
 * A ranked list of scores: label, bar, value, count.
 *
 * Colour comes from the band and nothing else. Used decoratively it would stop
 * meaning anything, and the band is the only thing here worth encoding twice.
 */
export function ScoreRows({ rows = [], max = 100, onSelect, emptyLabel = "Nothing measured yet." }) {
  if (!rows.length) return <div className="state small">{emptyLabel}</div>;

  return (
    <div role="list">
      {rows.map((r) => {
        const has = Number.isFinite(r.value);
        const body = (
          <>
            <span className="row-label">{r.label}</span>
            <span className="row-track">
              {has ? (
                <span
                  className="row-fill"
                  style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: bandColour(r.value) }}
                />
              ) : null}
            </span>
            <span className="row-value num" style={{ color: has ? bandColour(r.value) : "var(--faint)" }}>
              {has ? r.value.toFixed(1) : "—"}
            </span>
            <span className="row-count num">{r.count ?? ""}</span>
          </>
        );

        return onSelect ? (
          <button
            key={r.label}
            role="listitem"
            className="row"
            onClick={() => onSelect(r)}
            style={{ width: "100%", background: "none", border: 0, borderBottom: "1px solid var(--border)", textAlign: "left", cursor: "pointer", padding: "8px 0" }}
          >
            {body}
          </button>
        ) : (
          <div className="row" role="listitem" key={r.label}>{body}</div>
        );
      })}
    </div>
  );
}
