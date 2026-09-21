import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { client } from "../api/client.js";
import { MeasureCard } from "../components/MeasureCard.jsx";
import { Bar, BAND_COLOURS } from "../charts/Bar.jsx";
import { Line } from "../charts/Line.jsx";
import { Loading, Empty, ErrorState } from "../components/States.jsx";
import { segmentsFor, discontinuities } from "../lib/trends.js";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const BANDS = ["Poor", "Developing", "Good", "Strong", "Exemplary"];

export default function Overview() {
  const index = useQuery({ queryKey: ["index"], queryFn: client.index });
  const ts = useQuery({ queryKey: ["timeseries"], queryFn: client.timeseries });

  if (index.isLoading) return <Loading label="Loading overview" />;
  if (index.error) return <ErrorState error={index.error} onRetry={index.refetch} />;

  const pages = index.data?.pages ?? [];
  if (!pages.length) {
    return <Empty title="Nothing measured yet" hint="Run `geo-audit run product:<name>` to populate this." />;
  }

  const scored = pages.filter((p) => Number.isFinite(p.score));
  const probed = pages.filter((p) => Number.isFinite(p.fidelity));
  const graders = [...new Set(probed.map((p) => p.graderModel).filter(Boolean))];

  const points = ts.data?.points ?? [];
  const scoreSegs = segmentsFor(points, "score");
  const fidSegs = segmentsFor(points, "fidelity");

  const bands = BANDS.map((b) => ({
    label: b,
    value: pages.filter((p) => p.band === b).length,
    color: BAND_COLOURS[b],
  })).filter((b) => b.value > 0);

  return (
    <div className="wrap">
      <h1>Overview</h1>

      {/* Two measures, never one composite — see MeasureCard. */}
      <div className="grid two" style={{ marginTop: 16 }}>
        <MeasureCard
          label="Page quality"
          value={mean(scored.map((p) => p.score))}
          denominator={`${scored.length} of ${pages.length} pages audited`}
          provenance="structural rubric, 9 dimensions"
          description="How well pages are BUILT."
        />
        <MeasureCard
          label="Measured answer fidelity"
          value={mean(probed.map((p) => p.fidelity))}
          denominator={`${probed.length} of ${pages.length} pages probed`}
          provenance={graders.length ? `graded by ${graders.join(", ")}` : "not probed yet"}
          description="How well engines ANSWER."
        />
      </div>

      <p className="caveat">
        These measure different things and are deliberately not combined. In a pre-registered
        10-page study, structural score did <strong>not</strong> predict answer fidelity
        (Spearman r = −0.07, p = .84). Treat page quality as “is this page well built”, not as
        evidence the docs are effective.
        {graders.length > 1 ? (
          <>
            {" "}
            <strong>Mixed graders present ({graders.join(", ")})</strong> — fidelity scales are
            ~12 points apart between Opus and Sonnet and must not be compared directly.
          </>
        ) : null}
      </p>

      <h2>Coverage</h2>
      <Bar
        items={[
          { label: "Audited", value: scored.length, note: `of ${pages.length} known` },
          { label: "Probed", value: probed.length, note: `of ${pages.length} known` },
        ]}
        max={pages.length}
      />

      <h2>Distribution</h2>
      <Bar items={bands} format={(v) => `${v} page${v === 1 ? "" : "s"}`} />

      <h2>Trends</h2>
      {points.length < 2 ? (
        <Empty title="Not enough history yet" hint="Trends appear once a target has been run more than once." />
      ) : (
        <div className="grid two">
          <div className="card">
            <h3>Page quality</h3>
            <Line segments={scoreSegs} marks={discontinuities(points)} yLabel="structural score" />
          </div>
          <div className="card">
            <h3>Answer fidelity</h3>
            <Line segments={fidSegs} marks={discontinuities(points)} yLabel="fidelity" />
            <div className="small faint">
              Separate line per grader. A break means the protocol changed, not that quality jumped.
            </div>
          </div>
        </div>
      )}

      <p style={{ marginTop: 24 }}>
        <Link to="/pages">Browse all pages →</Link>
      </p>
    </div>
  );
}
