import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { client } from "../api/client.js";
import { DataTable } from "../components/DataTable.jsx";
import { Loading, Empty, ErrorState } from "../components/States.jsx";
import { productOfRun, dayOf } from "../lib/group.js";
import { money } from "../lib/format.js";

const STATUS_COLOUR = {
  complete: "var(--ok)",
  partial: "var(--warn)",
  cancelled: "var(--muted)",
  interrupted: "var(--sev-high)",
  running: "var(--accent)",
};

/**
 * Product first, and deliberately the SAME taxonomy the Pages view uses — a
 * single-page run against /ace/... sits with the `ace` product sweep. Grouping
 * runs by their raw target instead would give one bucket per single-page run
 * and a chip row of full URLs.
 */
const GROUPS = [
  { key: "product", label: "Product", of: productOfRun },
  {
    key: "status",
    label: "Status",
    of: (r) => r.status ?? "unknown",
    // Anything unfinished first — those are the rows that need a decision.
    order: ["running", "interrupted", "partial", "cancelled", "complete"],
  },
  { key: "day", label: "Day started", of: (r) => dayOf(r.startedAt) },
];

/** Recency and spend are what distinguish one product's run history from another. */
function summary(rows) {
  const spent = rows.reduce((a, r) => a + (r.cost?.measured ?? 0), 0);
  const last = rows
    .map((r) => r.startedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const incomplete = rows.filter((r) => r.status !== "complete").length;
  return [
    `${rows.length} ${rows.length === 1 ? "run" : "runs"}`,
    last ? `last ${new Date(last).toLocaleDateString()}` : null,
    money(spent),
    // Surfaced per group because a product whose runs are mostly partial has a
    // coverage problem that a mean over its pages would hide.
    incomplete ? `${incomplete} not complete` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function Runs() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["runs"], queryFn: client.runs });

  if (isLoading) return <div className="wrap"><Loading label="Loading runs" /></div>;
  if (error) return <div className="wrap"><ErrorState error={error} onRetry={refetch} /></div>;

  const rows = (data?.runs ?? []).map((r) => ({
    ...r,
    key: r.runId,
    targetLabel: `${r.target?.type}:${r.target?.name}`,
    product: productOfRun(r),
  }));

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
    {
      key: "cost",
      label: "Cost",
      width: 90,
      sortValue: (r) => r.cost?.measured ?? 0,
      // A run that cost nothing (every stage reused) is not a run whose cost is
      // unknown. `0` is falsy, so the old check rendered both as an em dash.
      render: (r) =>
        Number.isFinite(r.cost?.measured) ? money(r.cost.measured) : <span className="faint">—</span>,
    },
    { key: "graderModel", label: "Grader", width: 150, render: (r) => <span className="small muted">{r.graderModel?.replace("claude-", "") ?? "—"}</span> },
    {
      key: "startedAt",
      label: "Started",
      width: 150,
      // Descending by default: the run someone wants is nearly always the last one.
      render: (r) => <span className="small muted">{new Date(r.startedAt).toLocaleString()}</span>,
    },
  ];

  return (
    <div className="wrap">
      <h1>Runs</h1>
      <p className="caveat">
        Only <strong>complete</strong> runs contribute to trends. A partial or cancelled run is an
        average over the pages that happened to finish, which would read as a change in quality
        rather than a change in coverage.
      </p>
      <DataTable
        rows={rows}
        columns={columns}
        searchKeys={["targetLabel", "runId", "product", "status"]}
        groups={GROUPS}
        groupSummary={summary}
        defaultSort={{ key: "startedAt", dir: "desc" }}
        empty={<Empty title="No runs yet" />}
      />
      <p className="small faint" style={{ marginTop: 10 }}>
        Open a run to see what it did per page, where the time went, and the report each page produced.
      </p>
    </div>
  );
}
