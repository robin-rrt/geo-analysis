import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client.js";
import { Bar } from "../charts/Bar.jsx";
import { FidelityBadge } from "../components/FidelityBadge.jsx";
import { Loading, ErrorState, Empty } from "../components/States.jsx";

export default function PageDetail() {
  const { key } = useParams();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["page", key], queryFn: () => client.page(key) });

  if (isLoading) return <div className="wrap"><Loading label="Loading page" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const { audit, probeRuns = [], health } = data ?? {};
  const primary = probeRuns.find((r) => r.mode === "web") ?? probeRuns[0] ?? null;

  return (
    <div className="wrap">
      <p className="small"><Link to="/pages">← Pages</Link></p>
      <h1>{audit?.title ?? key}</h1>
      <p className="small mono faint">{audit?.url}</p>

      <div className="grid three" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="muted small">Page quality</div>
          <div style={{ fontSize: 26, fontWeight: 600 }}>{audit?.score ?? "—"}<span className="faint" style={{ fontSize: 14 }}>/100</span></div>
        </div>
        <div className="card">
          <div className="muted small">Answer fidelity</div>
          <div style={{ marginTop: 6 }}>
            <FidelityBadge value={primary?.avg_fidelity ?? null} graderModel={primary?.grader_model} probeCount={primary?.probe_count} />
          </div>
        </div>
        <div className="card">
          <div className="muted small">Run health</div>
          <div style={{ marginTop: 6 }} className="small">
            {health?.clean ? "clean" : `degraded (${health?.degraded ?? 0} degraded, ${health?.failed ?? 0} failed searches)`}
          </div>
        </div>
      </div>

      {audit?.dimensions?.length ? (
        <>
          <h2>Dimensions</h2>
          {/* Sorted ascending so the weakest — the thing to act on — reads first. */}
          <Bar
            items={[...audit.dimensions]
              .sort((a, b) => a.score - b.score)
              .map((d) => ({ label: d.name, value: d.score, note: `weight ${d.weight}` }))}
            max={10}
            format={(v) => `${v}/10`}
          />
        </>
      ) : null}

      <h2>Probes</h2>
      {!primary ? (
        <Empty title="Not probed" hint="Run the probes and test stages to measure how engines answer." />
      ) : (
        <>
          <p className="small muted">
            {primary.probe_count} probes, {primary.mode} mode, graded by {primary.grader_model}.
          </p>
          {(primary.results ?? []).map((r) => (
            <details key={r.probe_id} className="card" style={{ marginBottom: 8 }}>
              <summary>
                <strong>{r.probe_id}</strong>{" "}
                <span className="muted small">fidelity {r.fidelity ?? "—"}</span>{" "}
                <span className="faint small">{r.prompt?.slice(0, 90)}</span>
              </summary>
              <div className="small" style={{ marginTop: 10 }}>
                <p className="muted">{r.prompt}</p>
                <pre className="mono" style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>{r.answer}</pre>
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
