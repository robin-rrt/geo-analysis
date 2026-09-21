import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../api/client.js";
import { duration } from "../lib/format.js";

/**
 * Which action a page needs next.
 *
 *   no probe set        -> generate probes, then grade them
 *   probes, not graded  -> grade them. They are already bought; regenerating
 *                          would pay twice for the same set.
 *   graded              -> re-grade, offered quietly as a secondary action
 *
 * A pure function so it can be tested without mounting a component.
 */
export function nextAction(page) {
  const hasProbes = Boolean(page?.probeSet?.present);
  // graded_count > 0, not "a run exists": a run that errored on every probe
  // still writes a summary, and calling that tested hides the failure.
  const tested = Boolean(page?.tested);

  // Measured state is checked FIRST. Asking "are there probes?" first pushed
  // an already-measured page toward regenerating and re-paying, because a page
  // can carry results without the probe set that produced them — every page
  // imported from the correlation study is in exactly that state.
  if (tested) {
    return hasProbes
      ? {
          key: "retest",
          stages: ["test"],
          force: true,
          label: "Re-run the probes",
          why: "Already measured. Re-running grades the same probe set again against today's answers.",
          secondary: true,
        }
      : {
          key: "regenerate",
          stages: ["probes", "test"],
          force: true,
          label: "Regenerate probes & re-test",
          why: "Already measured, but the probe set that produced those results is not in this run — re-measuring needs a fresh set.",
          secondary: true,
        };
  }

  if (!hasProbes) {
    return {
      key: "generate",
      stages: ["probes", "test"],
      label: "Generate probes & test",
      why: "This page has no probe set. This writes one, then asks a model the questions and grades the answers.",
    };
  }
  return {
    key: "test",
    stages: ["test"],
    label: `Run the ${page.probeSet.count} existing probes`,
    why: "The probes are already generated and paid for — this only grades them.",
  };
}

/**
 * The next useful thing to do to this page, offered in place.
 *
 * Nothing starts without showing the cost first — a click here spends real
 * money — and the server enforces its own ceiling regardless of what is shown.
 */
export function PageActions({ page, url, onDone }) {
  const qc = useQueryClient();
  const [estimate, setEstimate] = useState(null);
  const [handle, setHandle] = useState(null);

  const action = nextAction(page);
  const target = `page:${url}`;

  const est = useMutation({
    mutationFn: () => client.estimate({ target, stages: action.stages, mode: "web" }),
    onSuccess: setEstimate,
  });

  const start = useMutation({
    mutationFn: () =>
      client.startRun({ target, stages: action.stages, mode: "web", confirm: true, force: action.force }),
    onSuccess: (r) => setHandle(r.handle),
  });

  const status = useQuery({
    queryKey: ["run", handle],
    queryFn: () => client.runStatus(handle),
    enabled: Boolean(handle),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (["complete", "partial", "cancelled", "failed"].includes(s)) {
        // Pull the page again so the new result replaces the old state.
        qc.invalidateQueries({ queryKey: ["page"] });
        onDone?.();
        return false;
      }
      return 2000;
    },
  });

  const running = handle && !["complete", "partial", "cancelled", "failed"].includes(status.data?.status);

  // Returned AFTER the hooks, not before: an early return above them would be a
  // rules-of-hooks violation. The published export has no API and must not
  // advertise an action it cannot perform.
  if (client.readOnly || !url) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <strong className="small">{action.secondary ? "Re-measure" : "Next step"}</strong>
        <span className="small muted">{action.why}</span>
      </div>

      {!estimate && !handle ? (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => est.mutate()} disabled={est.isPending}>
            {est.isPending ? "Checking cost…" : `${action.label} — check cost`}
          </button>
          {est.error ? <div className="small" style={{ color: "var(--sev-high)", marginTop: 6 }}>{est.error.message}</div> : null}
        </div>
      ) : null}

      {estimate && !handle ? (
        <div style={{ marginTop: 10 }}>
          <p className="small">
            Projected <strong>${estimate.estimate.total.toFixed(2)}</strong>{" "}
            <span className="faint">± {Math.round(estimate.estimate.band * 100)}%</span>
            {estimate.estimate.lines.map((l) => (
              <span key={l.stage} className="faint"> · {l.stage} ${l.cost.toFixed(2)}</span>
            ))}
          </p>
          <button className="primary" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? "Starting…" : `Run and spend ~$${estimate.estimate.total.toFixed(2)}`}
          </button>{" "}
          <button onClick={() => setEstimate(null)}>Cancel</button>
          {start.error ? <div className="small" style={{ color: "var(--sev-high)", marginTop: 6 }}>{start.error.message}</div> : null}
        </div>
      ) : null}

      {handle ? (
        <div style={{ marginTop: 10 }}>
          <p className="small">
            <strong>{status.data?.status ?? "starting"}</strong>
            {" — "}
            {status.data?.pages?.complete ?? 0}/{status.data?.pages?.total ?? 1} pages
            {status.data?.elapsedMs ? ` · ${duration(status.data.elapsedMs)} elapsed` : ""}
            {status.data?.etaMs != null ? ` · ~${duration(status.data.etaMs)} left` : ""}
          </p>
          {running ? <button onClick={() => client.cancelRun(handle)}>Cancel</button> : null}
          {status.data?.error ? (
            <div className="small" style={{ color: "var(--sev-high)" }}>{status.data.error}</div>
          ) : null}
          {!running && status.data ? (
            <p className="small muted">Done. Reload if the figures above have not refreshed.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
