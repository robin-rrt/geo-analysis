/**
 * A fidelity figure, always with its grader.
 *
 * Sonnet grades ~12 points harsher than Opus (measured, mean signed -12.1), so
 * a fidelity number without its grader is not comparable to any other fidelity
 * number. There is no TypeScript here, so the rule is a RUNTIME invariant: this
 * throws rather than defaulting, because a silent default is how an
 * incomparable number ends up in a slide.
 */
export function FidelityBadge({ value, graderModel, probeCount }) {
  if (value === null || value === undefined) {
    return <span className="muted small">not probed</span>;
  }
  if (!graderModel) {
    throw new Error(
      "FidelityBadge requires graderModel — a fidelity figure without its grader is not comparable",
    );
  }
  return (
    <span className="badge" title={`graded by ${graderModel}${probeCount ? ` over ${probeCount} probes` : ""}`}>
      <strong>{Math.round(value)}</strong>
      <span className="faint">/100</span>
      <span className="faint">· {graderModel.replace("claude-", "")}</span>
    </span>
  );
}
