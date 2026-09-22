/** Band indicator. Carries a text label, never colour alone. */
export function Band({ band }) {
  if (!band) return <span className="muted small">—</span>;
  return <span className={`band band-${band.toLowerCase()}`}>{band}</span>;
}
