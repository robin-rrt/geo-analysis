import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client.js";
import { Bar } from "../charts/Bar.jsx";
import { FidelityBadge } from "../components/FidelityBadge.jsx";
import { Loading, ErrorState, Empty } from "../components/States.jsx";
import { PageActions } from "../components/PageActions.jsx";

export default function PageDetail() {
  const { key } = useParams();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["page", key], queryFn: () => client.page(key) });

  if (isLoading) return <div className="wrap"><Loading label="Loading page" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const { audit, probeRuns = [], health } = data ?? {};
  const primary = probeRuns.find((r) => r.mode === "web") ?? probeRuns[0] ?? null;
  const url = audit?.url ?? null;

  return (
    <div className="wrap">
      <p className="small"><Link to="/pages">← Pages</Link></p>
      <h1>{audit?.title ?? key}</h1>
      <p className="small mono faint">{audit?.url}</p>

      {/* Offered in place, so the next step is where the gap is visible. */}
      <PageActions page={data} url={url} onDone={refetch} />

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

      {/* The report itself. parseAudit has always produced these; the UI simply
          never showed them, so "see the report it created" had no answer. */}
      {audit?.summary ? (
        <>
          <h2>Summary</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{audit.summary}</p>
        </>
      ) : null}

      {audit?.recommendations?.length ? (
        <>
          <h2>Recommended fixes</h2>
          <p className="small muted">Ordered by priority as the auditor ranked them.</p>
          {audit.recommendations.map((r, i) => (
            <div key={i} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span className="badge" style={{ color: r.priority === 1 ? "var(--sev-high)" : r.priority === 2 ? "var(--sev-med)" : "var(--sev-low)" }}>
                  P{r.priority}
                </span>
                <strong>{r.title}</strong>
              </div>
              {r.meta ? <div className="small faint" style={{ marginTop: 4 }}>{r.meta}</div> : null}
              {r.body ? <div className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{r.body}</div> : null}
            </div>
          ))}
        </>
      ) : null}

      {audit?.antiPatterns?.length ? (
        <>
          <h2>Anti-patterns found</h2>
          <ul className="small">{audit.antiPatterns.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </>
      ) : null}

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
          {/* Per-dimension critique — the reasoning behind each score. */}
          {audit.dimensions.some((d) => d.analysis) ? (
            <div style={{ marginTop: 12 }}>
              {[...audit.dimensions]
                .sort((a, b) => a.score - b.score)
                .filter((d) => d.analysis)
                .map((d) => (
                  <details key={d.name} className="card" style={{ marginBottom: 6 }}>
                    <summary>
                      <strong className="small">{d.name}</strong>{" "}
                      <span className="muted small">{d.score}/10 · weight {d.weight}</span>
                    </summary>
                    <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{d.analysis}</div>
                  </details>
                ))}
            </div>
          ) : null}
        </>
      ) : null}

      <h2>Probes</h2>
      {!primary ? (
        <Empty
          title={data?.probeSet?.present ? `${data.probeSet.count} probes generated, none graded` : "No probes yet"}
          hint={
            data?.probeSet?.present
              ? "The probe set exists and is paid for — grading it is the only remaining cost."
              : "Generate a probe set to measure how engines answer questions about this page."
          }
        />
      ) : !data?.tested ? (
        <Empty
          title="A probe run exists but graded nothing"
          hint={`${primary.probe_count ?? 0} probes, ${primary.error_count ?? 0} errored. The answers were never scored, so there is no fidelity for this page.`}
        />
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
