/** Loading, empty and error states. A blank screen is a bug, not a state. */
export function Loading({ rows = 6, label = "Loading" }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ margin: "10px 0", width: `${90 - i * 4}%` }} />
      ))}
    </div>
  );
}

export function Empty({ title, hint }) {
  return (
    <div className="state">
      <p><strong>{title}</strong></p>
      {hint ? <p className="small">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state" role="alert">
      <p><strong>Something went wrong</strong></p>
      <p className="small mono">{String(error?.message ?? error)}</p>
      {onRetry ? <button onClick={onRetry}>Try again</button> : null}
    </div>
  );
}
