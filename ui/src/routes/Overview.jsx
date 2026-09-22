import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { client } from "../api/client.js";
import { ScaleBar } from "../charts/ScaleBar.jsx";
import { bandColour } from "../lib/bands.js";
import { ScoreRows } from "../components/ScoreRows.jsx";
import { Findings } from "../components/Findings.jsx";
import { Line } from "../charts/Line.jsx";
import { Loading, Empty, ErrorState } from "../components/States.jsx";
import { segmentsFor, discontinuities } from "../lib/trends.js";
import { aggregatableTargets, weakestFirst } from "../components/ProductScores.jsx";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Dimension means across every product — a weakness in all of them is systemic. */
function systemicDimensions(products) {
  const byName = new Map();
  for (const p of products) {
    for (const d of p.dimensions ?? []) {
      if (!byName.has(d.name)) byName.set(d.name, { name: d.name, weight: d.weight, means: [] });
      byName.get(d.name).means.push(d.mean);
    }
  }
  return weakestFirst(
    [...byName.values()].map((d) => ({ name: d.name, weight: d.weight, mean: mean(d.means) })),
  );
}

/** Scores drift a couple of points between runs, so a tiny delta is not news. */
function deltaFor(points, field) {
  const usable = points.filter((p) => Number.isFinite(p[field]));
  if (usable.length < 2) return null;
  const sorted = [...usable].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return sorted.at(-1)[field] - sorted.at(-2)[field];
}

export default function Overview() {
  const navigate = useNavigate();
  const index = useQuery({ queryKey: ["index"], queryFn: client.index });
  const ts = useQuery({ queryKey: ["timeseries"], queryFn: client.timeseries });
  const prod = useQuery({ queryKey: ["products"], queryFn: client.products });

  if (index.isLoading) return <div className="wrap"><Loading label="Loading overview" /></div>;
  if (index.error) return <div className="wrap"><ErrorState error={index.error} onRetry={index.refetch} /></div>;

  const pages = index.data?.pages ?? [];
  if (!pages.length) {
    return (
      <div className="wrap">
        <Empty title="Nothing measured yet" hint="Run `geo-audit run product:<name>` to populate this." />
      </div>
    );
  }

  const scored = pages.filter((p) => Number.isFinite(p.score));
  const probed = pages.filter((p) => Number.isFinite(p.fidelity));
  const graders = [...new Set(probed.map((p) => p.graderModel).filter(Boolean))];

  const points = ts.data?.points ?? [];
  const products = aggregatableTargets(prod.data?.products ?? []);

  const qualityMean = mean(scored.map((p) => p.score));
  const fidelityMean = mean(probed.map((p) => p.fidelity));
  const qDelta = deltaFor(points, "score");
  const fDelta = deltaFor(points, "fidelity");

  const fmtDelta = (d) => (d === null ? "—" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`);
  const deltaTone = (d) => (d === null || Math.abs(d) < 1 ? undefined : d > 0 ? "var(--ok)" : "var(--sev-high)");

  const dims = systemicDimensions(products);

  return (
    <div className="wrap">
      {/* --------------------------------------------------------- headline */}
      <section className="reveal" style={{ marginTop: "var(--s7)" }}>
        <div className="grid headline">
          <ScaleBar
            value={qualityMean}
            label="Page quality"
            meta={`${scored.length} pages audited`}
            delta={qDelta}
            sub="How well the pages are built — the 9-dimension structural rubric."
          />
          <ScaleBar
            value={fidelityMean}
            label="Answer fidelity"
            meta={`${probed.length} of ${pages.length} probed`}
            delta={fDelta}
            sub={
              graders.length
                ? `How well engines answer — graded by ${graders.join(", ").replace(/claude-/g, "")}.`
                : "How well engines answer. Nothing probed yet."
            }
          />
        </div>

        <p className="note">
          These two are <strong>not combined into one score</strong>, and the distinction is the
          point. In a pre-registered 10-page study, page quality did not predict answer fidelity
          (Spearman r&nbsp;=&nbsp;−0.07, p&nbsp;=&nbsp;.84). A single headline number would assert a
          relationship the evidence does not support.
          {graders.length > 1 ? (
            <> Fidelity here spans <strong>more than one grader</strong>; Sonnet runs about 12
            points harsher than Opus, so the average crosses two scales.</>
          ) : null}
        </p>
      </section>

      {/* ----------------------------------------------------------- detail */}
      <section className="block reveal" style={{ animationDelay: "80ms" }}>
        <div className="grid split">
          <div className="ruled">
            <h2>Score by product</h2>
            <ScoreRows
              rows={products.map((p) => ({
                label: p.name,
                value: p.score?.mean ?? null,
                count: p.pages.audited,
                runId: p.runId,
              }))}
              onSelect={(r) => r.runId && navigate(`/runs/${encodeURIComponent(r.runId)}`)}
              emptyLabel="No product runs yet."
            />
            <div className="small faint" style={{ marginTop: "var(--s3)" }}>
              Worst first. The right column is pages audited. Select a product for its run.
            </div>
          </div>

          <div className="ruled">
            <h2>Weakest dimensions</h2>
            <Findings
              items={dims.slice(0, 5).map((d) => ({
                key: d.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
                state: d.mean < 4 ? "critical" : d.mean < 6 ? "weak" : "fair",
                tone: bandColour(d.mean * 10),
                value: d.mean.toFixed(1),
                detail: `Averaged across ${products.length} products, weight ${d.weight} of 100. ${
                  d.mean < 4
                    ? "Low mean on a high weight — the largest pool of recoverable points."
                    : "Consistent across products, so likely a template or convention rather than individual pages."
                }`,
              }))}
              emptyLabel="No dimension data yet."
            />
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- coverage */}
      <section className="block reveal" style={{ animationDelay: "160ms" }}>
        <div className="ruled" style={{ maxWidth: 560 }}>
          <h2>Coverage</h2>
          <ScoreRows
            rows={[
              { label: "Audited", value: (scored.length / pages.length) * 100, count: `${scored.length}/${pages.length}` },
              { label: "Probed", value: (probed.length / pages.length) * 100, count: `${probed.length}/${pages.length}` },
            ]}
          />
          <div className="small faint" style={{ marginTop: "var(--s3)" }}>
            Every average above is over the pages actually measured — coverage is what tells you how
            much of the corpus that is.
          </div>
        </div>
      </section>

      <section className="block reveal" style={{ animationDelay: "240ms" }}>
        <div className="ruled">
          <h2>Score over time</h2>
          {points.length < 2 ? (
            <Empty title="Not enough history" hint="Trends appear once a target has run more than once." />
          ) : (
            <>
              <Line
                segments={segmentsFor(points, "score")}
                marks={discontinuities(points)}
                height={160}
                yLabel="page quality"
              />
              <p className="note" style={{ marginTop: "var(--s2)" }}>
                One line per target and protocol. A break is a grader or protocol change, not a
                movement in quality.
              </p>
            </>
          )}
        </div>
      </section>

      <p className="small" style={{ marginTop: "var(--s7)" }}>
        <Link to="/pages">All pages →</Link>
        {"  ·  "}
        <Link to="/runs">Run history →</Link>
      </p>
    </div>
  );
}
