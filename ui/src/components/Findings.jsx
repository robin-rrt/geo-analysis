/**
 * The weakest rubric dimensions, as findings rather than a chart.
 *
 * A bar chart of nine dimensions invites comparing bar lengths; what matters is
 * which ones are cheap to fix and worth the most, so each row states its mean
 * and its rubric weight in words. Low mean on a high weight is where the points
 * are, and that is a sentence, not a shape.
 */
export function Findings({ items = [], emptyLabel = "Nothing to report." }) {
  if (!items.length) return <div className="state small">{emptyLabel}</div>;

  return (
    <div>
      {items.map((f) => (
        <div className="finding" key={f.key}>
          <div className="finding-head">
            <span className="finding-key">{f.key}</span>
            <span className="pill" style={{ color: f.tone }}>{f.state}</span>
            <span className="spacer" />
            <span className="num small" style={{ color: f.tone, fontWeight: 600 }}>{f.value}</span>
          </div>
          <div className="finding-body">{f.detail}</div>
        </div>
      ))}
    </div>
  );
}
