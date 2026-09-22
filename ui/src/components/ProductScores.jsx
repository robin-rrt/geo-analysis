import { Link } from "react-router-dom";
import { Bar } from "../charts/Bar.jsx";
import { FidelityBadge } from "./FidelityBadge.jsx";
import { Band } from "./Band.jsx";

/**
 * Which targets belong in a per-product view.
 *
 * Single-page targets are excluded: the Pages table already lists individual
 * pages, and a "product" of one page is noise in an aggregate section.
 * Watchlists are kept but labelled, because a curated set is a real grouping
 * someone deliberately made.
 */
export function aggregatableTargets(products = []) {
  return products.filter((p) => p.type !== "page" && (p.pages?.audited ?? 0) > 0);
}

/** The rubric's weakest dimensions first — that ordering is the actionable part. */
export function weakestFirst(dimensions = []) {
  return [...dimensions].sort((a, b) => a.mean - b.mean);
}

export function ProductScores({ products = [] }) {
  const rows = aggregatableTargets(products);
  if (!rows.length) return null;

  return (
    <div>
      {rows.map((p) => (
        <details key={`${p.type}:${p.name}`} className="item">
          <summary>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <strong>{p.name}</strong>
              {p.type !== "product" ? <span className="badge">{p.type}</span> : null}
              <span className="muted small">
                quality <strong>{p.score?.mean ?? "—"}</strong>
              </span>
              <Band band={bandOf(p.score?.mean)} />
              {/* Fidelity always travels with its grader. */}
              {p.fidelity ? (
                <FidelityBadge value={p.fidelity.mean} graderModel={p.fidelity.graders[0]} />
              ) : (
                <span className="small faint">not probed</span>
              )}
              <span className="small faint">
                {p.pages.audited} audited · {p.pages.probed} probed
              </span>
            </span>
          </summary>

          <div style={{ marginTop: 12 }}>
            {p.fidelity?.graders?.length > 1 ? (
              <p className="caveat">
                Mixed graders ({p.fidelity.graders.join(", ")}). Sonnet scores ~12 points harsher
                than Opus, so this average spans two scales and should not be read as one number.
              </p>
            ) : null}

            <h3 style={{ marginTop: 4 }}>Rubric dimensions, averaged across {p.pages.audited} page(s)</h3>
            <Bar
              items={weakestFirst(p.dimensions).map((d) => ({
                label: d.name,
                value: d.mean,
                note: `weight ${d.weight}`,
              }))}
              max={10}
              format={(v) => `${v}/10`}
              emptyLabel="No dimension data — the audits could not be parsed."
            />
            <p className="small faint">
              Weakest first. Weight is the dimension's share of the 100-point score, so a low mean
              on a high weight is where the points are.
            </p>

            {p.runId ? (
              <p className="small" style={{ marginTop: 10 }}>
                <Link to={`/runs/${encodeURIComponent(p.runId)}`}>Open the latest run →</Link>
              </p>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

const BANDS = [[85, "Exemplary"], [70, "Strong"], [55, "Good"], [40, "Developing"], [0, "Poor"]];
function bandOf(score) {
  if (score === null || score === undefined) return null;
  return BANDS.find(([min]) => score >= min)[1];
}
