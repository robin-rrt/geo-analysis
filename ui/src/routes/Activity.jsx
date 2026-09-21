import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { client } from "../api/client.js";
import { Empty, ErrorState, Loading } from "../components/States.jsx";
import { duration } from "../lib/format.js";

/**
 * What is happening right now.
 *
 * Reads from the server rather than from a handle held in this tab, so it
 * survives a reload and — importantly — shows runs started at the TERMINAL.
 * A dashboard that looks idle while the machine is spending money is worse
 * than no dashboard.
 */
export default function Activity() {
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["active"],
    queryFn: client.active,
    // Polling, not a stream. Runs take 7-40 minutes; a 2s poll is
    // indistinguishable and cannot silently die the way a socket can.
    refetchInterval: 2000,
  });

  if (isLoading) return <div className="wrap"><Loading label="Checking for running work" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const active = data?.active ?? [];

  return (
    <div className="wrap">
      <h1>Activity</h1>
      <p className="small muted">
        Live, from every process — runs started here and runs started at the terminal.
        {dataUpdatedAt ? <span className="faint"> · updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span> : null}
      </p>

      {!active.length ? (
        <Empty title="Nothing running" hint="Start a run from a page report, or with `geo-audit run <target>`." />
      ) : (
        active.map((run) => {
          const pct = run.pages?.total ? Math.round((run.pages.complete / run.pages.total) * 100) : null;
          return (
            <div key={run.handle} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong>{run.target ? `${run.target.type}:${run.target.name}` : "run"}</strong>
                <span className="badge">{run.status}</span>
                {/* Where it came from matters: the dashboard cannot cancel a
                    run owned by another process. */}
                <span className="faint small">{run.source === "external" ? "started at the terminal" : "started here"}</span>
                <div className="spacer" />
                {run.runId ? <Link className="small" to={`/runs/${encodeURIComponent(run.runId)}`}>open run →</Link> : null}
              </div>

              <div style={{ margin: "10px 0 4px", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>
                  {run.pages?.complete ?? 0} of {run.pages?.total ?? "?"} pages
                  {run.pages?.failed ? <span style={{ color: "var(--sev-high)" }}> · {run.pages.failed} failed</span> : null}
                </span>
                <span className="muted">
                  {duration(run.elapsedMs)} elapsed
                  {run.etaMs != null ? ` · ~${duration(run.etaMs)} left` : ""}
                </span>
              </div>

              <div style={{ background: "var(--track)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div
                  style={{
                    width: pct === null ? "100%" : `${Math.max(2, pct)}%`,
                    height: "100%",
                    background: "var(--accent)",
                    opacity: pct === null ? 0.35 : 1,
                    transition: "width .4s ease",
                  }}
                />
              </div>

              {run.etaBasis ? <div className="small faint" style={{ marginTop: 6 }}>estimate: {run.etaBasis}</div> : null}
              {run.stages ? <div className="small faint">stages: {run.stages.join(" → ")}</div> : null}

              {run.recent?.length ? (
                <div className="mono small" style={{ marginTop: 8, maxHeight: 140, overflow: "auto" }}>
                  {run.recent.map((l, i) => <div key={i} className="faint">{l.line}</div>)}
                </div>
              ) : null}

              {run.source === "server" && !["complete", "partial", "cancelled"].includes(run.status) ? (
                <button style={{ marginTop: 8 }} onClick={() => client.cancelRun(run.handle)}>Cancel</button>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
