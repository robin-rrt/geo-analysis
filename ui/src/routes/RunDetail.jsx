import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client.js";
import { Loading, ErrorState, Empty } from "../components/States.jsx";
import { duration, money, STAGE_OUTCOME } from "../lib/format.js";
import { Bar } from "../charts/Bar.jsx";

const STATUS_NOTE = {
  complete: null,
  partial: "Some pages failed. This run does not contribute to trends — an average over the pages that happened to finish would read as a quality change rather than a coverage change.",
  cancelled: "Stopped before finishing. Contributes no trend point.",
  interrupted: "The process died mid-run. Contributes no trend point.",
};

export default function RunDetail() {
  const { runId } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => client.run(runId),
  });

  if (isLoading) return <div className="wrap"><Loading label="Loading run" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const { breakdown, ledger, target, status, protocol, cost, startedAt, endedAt, counts } = data ?? {};
  const elapsed = endedAt && startedAt ? new Date(endedAt) - new Date(startedAt) : null;
  const pages = breakdown?.pages ?? [];
  const failures = breakdown?.failures ?? ledger?.failures ?? [];

  // Where the time actually went, so "what did it do" has an answer in minutes.
  const stageTime = {};
  for (const p of pages) {
    for (const [stage, ms] of Object.entries(p.durations ?? {})) {
      stageTime[stage] = (stageTime[stage] ?? 0) + ms;
    }
  }

  return (
    <div className="wrap">
      <p className="small"><Link to="/runs">← Runs</Link></p>
      <h1>{target?.type}:{target?.name}</h1>
      <p className="small mono faint">{runId}</p>

      <div className="grid three" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="muted small">Status</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{status}</div>
          <div className="small faint">{counts?.pages ?? 0} pages{counts?.failed ? `, ${counts.failed} failed` : ""}</div>
        </div>
        <div className="card">
          <div className="muted small">Duration</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{duration(elapsed)}</div>
          <div className="small faint">{startedAt ? new Date(startedAt).toLocaleString() : "—"}</div>
        </div>
        <div className="card">
          <div className="muted small">Cost</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{money(cost?.measured)}</div>
          <div className="small faint">{breakdown?.counts?.reused ? `${breakdown.counts.reused} artifact(s) reused` : "nothing reused"}</div>
        </div>
      </div>

      {STATUS_NOTE[status] ? <p className="caveat">{STATUS_NOTE[status]}</p> : null}
      {/* A run can explain itself — a re-grade in particular is not obvious from
          a stage called "regrade". */}
      {breakdown?.note ? <p className="caveat">{breakdown.note}</p> : null}

      <h2>What it did</h2>
      {!breakdown ? (
        <Empty
          title="No breakdown recorded"
          hint="This run predates per-page recording. Newer runs capture every stage and its duration."
        />
      ) : (
        <>
          <p className="small muted">
            Stages: {(breakdown.stages ?? []).join(" → ")} · grader {protocol?.graderModel ?? "—"} ·
            {" "}model under test {protocol?.probeModel ?? "—"} ({protocol?.probeEffort ?? "—"}, {protocol?.mode ?? "—"})
          </p>

          {Object.keys(stageTime).length ? (
            <>
              <h3>Where the time went</h3>
              <Bar
                items={Object.entries(stageTime)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, ms]) => ({ label: stage, value: ms, note: duration(ms) }))}
                format={() => ""}
              />
              <p className="small faint">Summed across pages; pages run concurrently, so this exceeds wall time.</p>
            </>
          ) : null}

          <h3>Pages</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">Page</th>
                {(breakdown.stages ?? []).filter((s) => s !== "resolve" && s !== "rollup").map((s) => (
                  <th key={s} scope="col" style={{ width: 90 }}>{s}</th>
                ))}
                <th scope="col" style={{ width: 170 }}>result</th>
                <th scope="col" style={{ width: 80 }}>time</th>
                <th scope="col" style={{ width: 110 }}>report</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.key}>
                  <td>
                    <span className="small">{p.key}</span>
                    <div className="faint small mono">{p.url}</div>
                  </td>
                  {(breakdown.stages ?? []).filter((s) => s !== "resolve" && s !== "rollup").map((s) => {
                    const outcome = p.stages?.[s];
                    const meta = STAGE_OUTCOME[outcome];
                    return (
                      <td key={s} className="small">
                        {meta ? <span style={{ color: meta.tone }}>{meta.label}</span> : <span className="faint">—</span>}
                        {p.durations?.[s] ? <div className="faint small">{duration(p.durations[s])}</div> : null}
                      </td>
                    );
                  })}
                  <td className="small">
                    {p.probeSummary ? (
                      <>
                        <span>
                          fidelity <strong>{p.probeSummary.avgFidelity ?? "—"}</strong>
                          {Number.isFinite(p.probeSummary.avgFidelityBefore) ? (
                            <span className="faint"> (was {Math.round(p.probeSummary.avgFidelityBefore)})</span>
                          ) : null}
                        </span>
                        <div className="faint small">
                          {p.probeSummary.graded ?? 0}/{p.probeSummary.probes ?? 0} graded
                          {p.probeSummary.unattributed ? (
                            /* Excluded from the fidelity beside it — a
                               discoverability failure, not bad writing. */
                            <span style={{ color: "var(--warn)" }}> · {p.probeSummary.unattributed} wrong-subject</span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td className="small muted">{duration(p.elapsedMs)}</td>
                  <td>
                    {/* The thing that was missing: a way to reach what the run produced. */}
                    <Link to={`/pages/${p.key}`} className="small">View report →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {failures.length ? (
        <>
          <h2>Failures ({failures.length})</h2>
          <table>
            <thead><tr><th scope="col">Page</th><th scope="col">Why</th></tr></thead>
            <tbody>
              {failures.map((f, i) => (
                <tr key={i}>
                  <td className="small mono">{f.url}</td>
                  <td className="small" style={{ color: "var(--sev-high)" }}>{f.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {ledger?.ledger?.length ? (
        <>
          <h2>Ledger</h2>
          <p className="small muted">
            {ledger.counts?.discovered ?? 0} pages discovered, {ledger.counts?.inScope ?? 0} in scope.
            Every URL considered, and why it was excluded.
          </p>
          <details>
            <summary className="small">Show all {ledger.ledger.length}</summary>
            <table>
              <thead><tr><th scope="col">URL</th><th scope="col" style={{ width: 200 }}>Included</th></tr></thead>
              <tbody>
                {ledger.ledger.map((e, i) => (
                  <tr key={i}>
                    <td className="small mono">{e.url}</td>
                    <td className="small">{e.included ? "yes" : <span className="muted">no — {e.reason ?? "not in scope"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : null}
    </div>
  );
}
