import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { client } from "../api/client.js";
import { Loading, ErrorState } from "../components/States.jsx";

const STAGES = ["audit", "probes", "test", "rollup"];

/**
 * Start a run.
 *
 * The estimate is shown BEFORE the button is usable, and the confirm carries the
 * dollar figure. A full-site sweep is ~$250; a one-click path to that is a
 * hazard, not a feature. The ceiling itself is enforced server-side — this
 * screen cannot raise it.
 */
export default function NewRun() {
  const targets = useQuery({ queryKey: ["targets"], queryFn: client.targets });
  const [type, setType] = useState("product");
  const [name, setName] = useState("");
  const [stages, setStages] = useState(["audit"]);
  const [mode, setMode] = useState("web");
  const [estimate, setEstimate] = useState(null);
  const [started, setStarted] = useState(null);

  const spec = `${type}:${name}`;

  const est = useMutation({
    mutationFn: () => client.estimate({ target: spec, stages, mode }),
    onSuccess: setEstimate,
  });
  const start = useMutation({
    mutationFn: (confirm) => client.startRun({ target: spec, stages, mode, confirm }),
    onSuccess: setStarted,
  });

  const status = useQuery({
    queryKey: ["run", started?.handle],
    queryFn: () => client.runStatus(started.handle),
    enabled: Boolean(started?.handle),
    // Polling, not SSE: for a 7-40 minute job on localhost this is
    // indistinguishable and needs no connection registry or reconnection logic.
    refetchInterval: (q) => (["complete", "partial", "cancelled", "failed"].includes(q.state.data?.status) ? false : 2000),
  });

  if (targets.isLoading) return <div className="wrap"><Loading label="Loading targets" /></div>;

  const options =
    type === "product" ? targets.data?.products ?? [] : type === "watchlist" ? targets.data?.watchlists ?? [] : targets.data?.pages ?? [];

  return (
    <div className="wrap">
      <h1>New run</h1>

      <div className="controls">
        <select value={type} onChange={(e) => { setType(e.target.value); setName(""); setEstimate(null); }} aria-label="Target type">
          <option value="product">Product</option>
          <option value="watchlist">Watchlist</option>
          <option value="page">Single page</option>
        </select>

        {/* Single-page picking is backed by sitemap URLs — this is the
            "figured out from the sitemap" requirement. */}
        <input
          list="target-options"
          value={name}
          placeholder={type === "page" ? "https://docs.chain.link/..." : "name"}
          onChange={(e) => { setName(e.target.value); setEstimate(null); }}
          style={{ minWidth: 380 }}
          aria-label="Target"
        />
        <datalist id="target-options">
          {options.slice(0, 500).map((o) => <option key={o} value={o} />)}
        </datalist>
      </div>

      <div className="controls">
        {STAGES.map((s) => (
          <label key={s} className="small">
            <input
              type="checkbox"
              checked={stages.includes(s)}
              onChange={(e) => { setStages(e.target.checked ? [...stages, s] : stages.filter((x) => x !== s)); setEstimate(null); }}
            />{" "}
            {s}
          </label>
        ))}
        <select value={mode} onChange={(e) => { setMode(e.target.value); setEstimate(null); }} aria-label="Mode">
          <option value="web">web</option>
          <option value="closed">closed</option>
        </select>
        <button onClick={() => est.mutate()} disabled={!name || est.isPending}>
          {est.isPending ? "Estimating…" : "Estimate cost"}
        </button>
      </div>

      {est.error ? <ErrorState error={est.error} /> : null}

      {estimate ? (
        <div className="card">
          <h3>Projected cost</h3>
          <p style={{ fontSize: 24, fontWeight: 600, margin: "4px 0" }}>
            ${estimate.estimate.total.toFixed(2)}{" "}
            <span className="faint small">± {Math.round(estimate.estimate.band * 100)}% · {estimate.pageCount} pages</span>
          </p>
          {estimate.estimate.lines.map((l) => (
            <div key={l.stage} className="small muted">{l.stage}: {l.detail} — ${l.cost.toFixed(2)}</div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button className="primary" onClick={() => start.mutate(true)} disabled={start.isPending || Boolean(started)}>
              {start.isPending ? "Starting…" : `Run and spend ~$${estimate.estimate.total.toFixed(2)}`}
            </button>
          </div>
          {start.error ? <ErrorState error={start.error} /> : null}
        </div>
      ) : null}

      {started ? (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Progress</h3>
          <p className="small muted">
            {status.data?.status ?? "starting"} — {status.data?.pages?.complete ?? 0}/{status.data?.pages?.total ?? 0} pages
            {status.data?.pages?.failed ? `, ${status.data.pages.failed} failed` : ""}
          </p>
          {status.data?.cost ? (
            <p className="small">spent ${Number(status.data.cost.spent ?? 0).toFixed(2)} of ~${Number(status.data.cost.projected ?? 0).toFixed(2)}</p>
          ) : null}
          <button onClick={() => client.cancelRun(started.handle)} disabled={["complete", "partial", "cancelled"].includes(status.data?.status)}>
            Cancel
          </button>
          <div className="mono small" style={{ marginTop: 10, maxHeight: 200, overflow: "auto" }}>
            {(status.data?.recent ?? []).map((l, i) => <div key={i} className="faint">{l.line}</div>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
