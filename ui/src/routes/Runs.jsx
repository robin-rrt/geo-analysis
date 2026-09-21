import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { client } from "../api/client.js";
import { DataTable } from "../components/DataTable.jsx";
import { Loading, Empty, ErrorState } from "../components/States.jsx";

const STATUS_COLOUR = {
  complete: "var(--ok)",
  partial: "var(--warn)",
  cancelled: "var(--muted)",
  interrupted: "var(--sev-high)",
  running: "var(--accent)",
};

export default function Runs() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["runs"], queryFn: client.runs });

  if (isLoading) return <div className="wrap"><Loading label="Loading runs" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const rows = (data?.runs ?? []).map((r) => ({ ...r, key: r.runId, targetLabel: `${r.target?.type}:${r.target?.name}` }));

  const columns = [
    {
      key: "targetLabel",
      label: "Target",
      render: (r) => (
        <>
          <Link to={`/runs/${encodeURIComponent(r.runId)}`}>{r.targetLabel}</Link>
          <div className="faint small mono">{r.runId}</div>
        </>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 130,
      render: (r) => <span style={{ color: STATUS_COLOUR[r.status] ?? "var(--muted)" }}>{r.status}</span>,
    },
    { key: "pages", label: "Pages", width: 110, sortValue: (r) => r.counts?.pages ?? 0, render: (r) => `${r.counts?.pages ?? 0}${r.counts?.failed ? ` (${r.counts.failed} failed)` : ""}` },
    { key: "cost", label: "Cost", width: 90, sortValue: (r) => r.cost?.measured ?? 0, render: (r) => (r.cost?.measured ? `$${r.cost.measured.toFixed(2)}` : <span className="faint">—</span>) },
    { key: "graderModel", label: "Grader", width: 150, render: (r) => <span className="small muted">{r.graderModel?.replace("claude-", "") ?? "—"}</span> },
    { key: "startedAt", label: "Started", width: 150, render: (r) => <span className="small muted">{new Date(r.startedAt).toLocaleString()}</span> },
  ];

  return (
    <div className="wrap">
      <h1>Runs</h1>
      <p className="caveat">
        Only <strong>complete</strong> runs contribute to trends. A partial or cancelled run is an
        average over the pages that happened to finish, which would read as a change in quality
        rather than a change in coverage.
      </p>
      <DataTable rows={rows} columns={columns} searchKeys={["targetLabel", "runId"]} empty={<Empty title="No runs yet" />} />
      <p className="small faint" style={{ marginTop: 10 }}>
        Open a run to see what it did per page, where the time went, and the report each page produced.
      </p>
    </div>
  );
}
