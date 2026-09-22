import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { client } from "../api/client.js";
import { DataTable } from "../components/DataTable.jsx";
import { Band } from "../components/Band.jsx";
import { FidelityBadge } from "../components/FidelityBadge.jsx";
import { Loading, Empty, ErrorState } from "../components/States.jsx";
import { productOf, meanOf } from "../lib/group.js";

/**
 * Grouped by product first. The corpus is 93 pages across 15 URL sections, and
 * the question people actually arrive with is "how is CRE doing", not "show me
 * every page in score order".
 */
const GROUPS = [
  { key: "product", label: "Product", of: productOf },
  {
    key: "band",
    label: "Band",
    of: (r) => r.band ?? "Not scored",
    order: ["Exemplary", "Strong", "Good", "Developing", "Poor", "Not scored"],
  },
  {
    key: "measured",
    label: "Measured",
    of: (r) => (Number.isFinite(r.fidelity) ? "Fidelity measured" : "Audit only"),
    order: ["Audit only", "Fidelity measured"],
  },
  {
    key: "health",
    label: "Run health",
    of: (r) => (r.healthClean ? "Clean" : "Degraded"),
    // Degraded first: it is the group someone opens this view to find.
    order: ["Degraded", "Clean"],
  },
];

/** What a group is worth knowing at a glance, without opening it. */
function summary(rows) {
  const score = meanOf(rows, (r) => r.score);
  const fidelity = meanOf(rows, (r) => r.fidelity);
  const measured = rows.filter((r) => Number.isFinite(r.fidelity)).length;
  const parts = [
    score === null ? "not scored" : `mean quality ${Math.round(score)}`,
    // Coverage is stated as a fraction because a mean fidelity over 2 of 43
    // pages is a different claim from one over 43 of 43.
    `${measured}/${rows.length} probed${fidelity === null ? "" : ` · mean fidelity ${Math.round(fidelity)}`}`,
  ];
  return parts.join(" · ");
}

export default function Pages() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["index"], queryFn: client.index });

  if (isLoading) return <div className="wrap"><Loading label="Loading pages" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const rows = (data?.pages ?? []).map((r) => ({ ...r, product: productOf(r) }));
  const columns = [
    {
      key: "title",
      label: "Page",
      render: (r) => (
        <>
          <Link to={`/pages/${r.key}`}>{r.title ?? r.key}</Link>
          <div className="faint small mono">{r.url ?? "not yet audited"}</div>
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
      <div className="page-head">
        <div className="eyebrow">Corpus</div>
        <h1>Pages</h1>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        // `product` is searchable so typing "cre" finds the section as well as
        // any page whose title happens to contain it.
        searchKeys={["title", "url", "key", "product"]}
        groups={GROUPS}
        groupSummary={summary}
        empty={<Empty title="No pages yet" hint="Run `geo-audit run` to populate this." />}
      />
    </div>
  );
}
