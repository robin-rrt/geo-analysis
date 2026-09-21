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
 * The two explicit controls, always available regardless of page state.
 *
 * Separate from `nextAction` on purpose. That answers "what does this page
 * need?"; these answer "I want to redo a specific step" — most often because
 * the probe GENERATOR changed and an existing set now asks worse questions than
 * it would today.
 */
export function explicitActions(page) {
  const hasProbes = Boolean(page?.probeSet?.present);
  return [
    {
      key: "regen-probes",
      stages: ["probes"],
      force: true,
      // Regenerating without re-testing deliberately leaves a new question set
      // beside old answers. The page then reads as untested, which is honest —
      // better than silently spending on a full re-test nobody asked for.
      label: hasProbes ? "Regenerate probes" : "Generate probes",
      short: "Probes",
      why: hasProbes
        ? "Writes a fresh probe set from the page as it is now. Existing answers are not re-graded, so this page will read as untested until you re-run the test."
        : "Writes a probe set from the page as it is now, without grading anything yet.",
      icon: "probes",
    },
    {
      key: "redo-test",
      stages: ["test"],
      force: true,
      label: "Re-run the test",
      short: "Test",
      why: hasProbes
        ? "Asks a model the existing probes again and grades the answers. Does not regenerate the questions."
        : "No probe set exists yet — generate one first.",
      icon: "test",
      disabled: !hasProbes,
    },
  ];
}

function Icon({ name }) {
  const common = {
    width: 15, height: 15, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor",
    strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
  };
  if (name === "probes") {
    // A document being rewritten.
    return (
      <svg {...common}>
        <path d="M11.5 2.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-9" />
        <path d="M11.5 2.5v5h4" />
        <path d="M7.5 11.5h5M7.5 14h3" />
      </svg>
    );
  }
  // A replay arrow around a play triangle: run it again.
  return (
    <svg {...common}>
      <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7" />
      <path d="M17 3v3.5h-3.5" />
      <path d="M8.5 7.6l3.5 2.4-3.5 2.4z" />
    </svg>
  );
}

/**
 * The next useful thing to do to this page, plus explicit re-run controls.
 *
 * Nothing starts without showing the cost first — a click here spends real
 * money — and the server enforces its own ceiling regardless of what is shown.
 */
export function PageActions({ page, url, onDone }) {
  const qc = useQueryClient();
  // Which action is awaiting confirmation. Holding it in state is what lets one
  // estimate/confirm flow serve the suggestion and both explicit controls.
  const [pending, setPending] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [handle, setHandle] = useState(null);

  const suggested = nextAction(page);
  const explicit = explicitActions(page);
  const target = `page:${url}`;

  const est = useMutation({
    mutationFn: (action) => client.estimate({ target, stages: action.stages, mode: "web" }),
    onSuccess: setEstimate,
  });

  const start = useMutation({
    mutationFn: (action) =>
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
        qc.invalidateQueries({ queryKey: ["page"] });
        onDone?.();
        return false;
      }
      return 2000;
    },
  });

  const running = handle && !["complete", "partial", "cancelled", "failed"].includes(status.data?.status);

  const choose = (action) => {
    setPending(action);
    setEstimate(null);
    est.mutate(action);
  };

  // Returned AFTER the hooks, not before: an early return above them would be a
  // rules-of-hooks violation. The published export has no API and must not
  // advertise an action it cannot perform.
  if (client.readOnly || !url) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong className="small">{suggested.secondary ? "Re-measure" : "Next step"}</strong>
        <span className="small muted" style={{ flex: 1, minWidth: 200 }}>{suggested.why}</span>

        {/* Explicit controls. The icon never carries the meaning alone: each has
            a visible word, an aria-label and a title. */}
        <div style={{ display: "flex", gap: 6 }}>
          {explicit.map((a) => (
            <button
              key={a.key}
              onClick={() => choose(a)}
              disabled={a.disabled || est.isPending || Boolean(handle)}
              aria-label={a.label}
              title={`${a.label} — ${a.why}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 9px" }}
            >
              <Icon name={a.icon} />
              <span className="small">{a.short}</span>
            </button>
          ))}
        </div>
      </div>

      {!pending && !handle ? (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => choose(suggested)} disabled={est.isPending}>
            {est.isPending ? "Checking cost…" : `${suggested.label} — check cost`}
          </button>
        </div>
      ) : null}

      {est.error ? (
        <div className="small" style={{ color: "var(--sev-high)", marginTop: 8 }}>{est.error.message}</div>
      ) : null}

      {pending && estimate && !handle ? (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <div className="small"><strong>{pending.label}</strong></div>
          <p className="small muted" style={{ margin: "4px 0" }}>{pending.why}</p>
          <p className="small">
            Projected <strong>${estimate.estimate.total.toFixed(2)}</strong>{" "}
            <span className="faint">± {Math.round(estimate.estimate.band * 100)}%</span>
            {estimate.estimate.lines.map((l) => (
              <span key={l.stage} className="faint"> · {l.stage} ${l.cost.toFixed(2)}</span>
            ))}
          </p>
          <button className="primary" onClick={() => start.mutate(pending)} disabled={start.isPending}>
            {start.isPending ? "Starting…" : `Run and spend ~$${estimate.estimate.total.toFixed(2)}`}
          </button>{" "}
          <button onClick={() => { setPending(null); setEstimate(null); }}>Cancel</button>
          {start.error ? (
            <div className="small" style={{ color: "var(--sev-high)", marginTop: 6 }}>{start.error.message}</div>
          ) : null}
        </div>
      ) : null}

      {handle ? (
        <div style={{ marginTop: 10 }}>
          <p className="small">
            <strong>{status.data?.status ?? "starting"}</strong>
            {" — "}
            {status.data?.pages?.complete ?? 0}/{status.data?.pages?.total ?? 1} pages
            {status.data?.elapsedMs ? ` \u00b7 ${duration(status.data.elapsedMs)} elapsed` : ""}
            {status.data?.etaMs != null ? ` \u00b7 ~${duration(status.data.etaMs)} left` : ""}
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
