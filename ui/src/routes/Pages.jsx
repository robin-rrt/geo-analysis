import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { client } from "../api/client.js";
import { DataTable } from "../components/DataTable.jsx";
import { Band } from "../components/Band.jsx";
import { FidelityBadge } from "../components/FidelityBadge.jsx";
import { Loading, Empty, ErrorState } from "../components/States.jsx";

export default function Pages() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["index"], queryFn: client.index });

  if (isLoading) return <div className="wrap"><Loading label="Loading pages" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const rows = data?.pages ?? [];
  const columns = [
    {
      key: "title",
      label: "Page",
      render: (r) => (
        <>
          <Link to={`/pages/${r.key}`}>{r.title ?? r.key}</Link>
          <div className="faint small mono">{r.url}</div>
        </>
      ),
    },
    { key: "score", label: "Quality", width: 90, render: (r) => (Number.isFinite(r.score) ? Math.round(r.score) : <span className="faint">—</span>) },
    { key: "band", label: "Band", width: 130, render: (r) => <Band band={r.band} /> },
    {
      key: "fidelity",
      label: "Fidelity",
      width: 180,
      render: (r) => <FidelityBadge value={r.fidelity} graderModel={r.graderModel} probeCount={r.probeCount} />,
    },
    {
      key: "healthClean",
      label: "Run health",
      width: 110,
      render: (r) =>
        r.healthClean ? <span className="small muted">clean</span> : <span className="small" style={{ color: "var(--warn)" }}>degraded</span>,
    },
    { key: "at", label: "Last run", width: 120, render: (r) => <span className="small muted">{new Date(r.at).toLocaleDateString()}</span> },
  ];

  return (
    <div className="wrap">
      <h1>Pages</h1>
      <DataTable
        rows={rows}
        columns={columns}
        searchKeys={["title", "url", "key"]}
        empty={<Empty title="No pages yet" hint="Run `geo-audit run` to populate this." />}
      />
    </div>
  );
}
