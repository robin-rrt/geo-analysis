import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { client } from "../api/client.js";
import { Loading, ErrorState, Empty } from "../components/States.jsx";
import { duration, money, STAGE_OUTCOME } from "../lib/format.js";
import { Bar } from "../charts/Bar.jsx";

const STATUS_TONE = {
  complete: "var(--ok)",
  partial: "var(--warn)",
  cancelled: "var(--muted)",
  interrupted: "var(--sev-high)",
  running: "var(--accent)",
};

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
      <div className="page-head">
        <div className="eyebrow"><Link to="/runs" className="quiet">Runs</Link></div>
        <h1>{target?.type}:{target?.name}</h1>
        <div className="sub mono">{runId}</div>
      </div>

      <div className="figure-row ruled">
        <div className="figure">
          <div className="figure-value" style={{ fontSize: 26, color: STATUS_TONE[status] ?? "var(--text)" }}>{status}</div>
          <div className="figure-label">Status</div>
          <div className="figure-note">{counts?.pages ?? 0} pages{counts?.failed ? ` · ${counts.failed} failed` : ""}</div>
        </div>
        <div className="figure">
          <div className="figure-value">{duration(elapsed)}</div>
          <div className="figure-label">Duration</div>
          <div className="figure-note">{startedAt ? new Date(startedAt).toLocaleString() : "—"}</div>
        </div>
        <div className="figure">
          <div className="figure-value">{money(cost?.measured)}</div>
          <div className="figure-label">Cost</div>
          <div className="figure-note">{breakdown?.counts?.reused ? `${breakdown.counts.reused} reused` : "nothing reused"}</div>
        </div>
      </div>

      {STATUS_NOTE[status] ? <p className="caveat">{STATUS_NOTE[status]}</p> : null}
      {/* A run can explain itself — a re-grade in particular is not obvious from
          a stage called "regrade". */}
      {breakdown?.note ? <p className="caveat">{breakdown.note}</p> : null}

      <section className="ruled" style={{ marginTop: "var(--s6)" }}>
      <h2>What it did</h2>
      {!breakdown ? (
        <Empty
          title="No breakdown recorded"
          hint="This run predates per-page recording. Newer runs capture every stage and its duration."
        />
      ) : (
        <>
          <p className="meta-row">
            <span>Stages: {(breakdown.stages ?? []).join(" → ")} · grader {protocol?.graderModel ?? "—"} ·
            {" "}model under test {protocol?.probeModel ?? "—"} ({protocol?.probeEffort ?? "—"}, {protocol?.mode ?? "—"})</span>
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
      </section>

      {failures.length ? (
        <section className="ruled" style={{ marginTop: "var(--s6)" }}>
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
        </section>
      ) : null}

      {ledger?.ledger?.length ? (
        <section className="ruled" style={{ marginTop: "var(--s6)" }}>
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
        </section>
      ) : null}
    </div>
  );
}
