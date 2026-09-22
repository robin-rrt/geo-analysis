/**
 * Weakest rubric dimensions, written as findings.
 *
 * A bar chart of nine dimensions invites comparing lengths. What matters is
 * which one is cheap to fix and worth the most — a low mean on a high weight —
 * and that is a sentence, not a shape. The figure hangs in the margin so the
 * column of numbers can still be scanned.
 */
export function Findings({ items = [], emptyLabel = "Nothing to report." }) {
  if (!items.length) return <div className="state small">{emptyLabel}</div>;

  return (
    <div>
      {items.map((f, i) => (
        <div
          className="finding ruled-soft"
          key={f.key}
          style={{ paddingBottom: "var(--s3)", marginTop: i ? "var(--s3)" : 0 }}
        >
          <div>
            <div className="finding-key">{f.key}</div>
            <div className="finding-body">{f.detail}</div>
          </div>
          <div>
            <div className="finding-fig" style={{ color: f.tone }}>{f.value}</div>
            <div className="small faint" style={{ textAlign: "right" }}>{f.state}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
