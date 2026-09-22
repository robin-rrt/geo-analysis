import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { groupRows, sortGroups, UNGROUPED } from "../lib/group.js";

/**
 * The workhorse table: pagination, sort, filter, search and grouping, all
 * synced to the URL.
 *
 * URL-as-state is the point. "Look at this page's regression" has to be a link
 * someone can paste, so every view must be reproducible from its address.
 *
 * Grouping (optional, via `groups`) exists because a flat list stops being
 * navigable somewhere around fifty rows: the real corpus is 93 pages across 15
 * URL sections, and finding "the CRE pages" meant reading every row. Two modes:
 *
 *   overview  — grouped sections, each collapsible, PAGINATED BY GROUP
 *   focused   — one group selected from the chip row, rendered flat
 *
 * Paginating by group rather than by row is what keeps a group whole; a group
 * split across two pages is worse than no grouping at all.
 */
export function DataTable({
  rows,
  columns,
  pageSizes = [25, 50, 100],
  searchKeys = [],
  empty,
  groups = null,
  groupSummary = null,
  defaultSort = null,
}) {
  const [params, setParams] = useSearchParams();
  const [collapsed, setCollapsed] = useState(() => new Set());

  const q = params.get("q") ?? "";
  // A view's natural order is a property of the view: runs want newest first,
  // pages want worst-scoring first. The URL still wins when it carries a sort.
  const sort = params.get("sort") ?? defaultSort?.key ?? columns[0]?.key;
  // Normalized rather than passed through: a junk `dir` in a hand-edited URL
  // must land on a real order, not render arrows for a direction that is
  // neither ascending nor descending.
  const dir = (params.get("dir") ?? (params.get("sort") ? "asc" : defaultSort?.dir)) === "desc" ? "desc" : "asc";
  const size = Number(params.get("size") ?? pageSizes[0]);
  const page = Math.max(1, Number(params.get("page") ?? 1));

  // Which grouping is applied, and which single group is focused. Both live in
  // the URL; collapse state does not — it is transient UI, not a view worth
  // sharing.
  const groupKey = params.get("group") ?? groups?.[0]?.key ?? "none";
  const grouping = groups?.find((g) => g.key === groupKey) ?? null;
  const focused = params.get("g") ?? "";

  const update = (next) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined || v === "") merged.delete(k);
      else merged.set(k, String(v));
    }
    setParams(merged, { replace: true });
  };

  const filtered = useMemo(() => {
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle)));
  }, [rows, q, searchKeys]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort);
    const get = col?.sortValue ?? ((r) => r[sort]);
    return [...filtered].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1; // nulls last, both directions
      if (y === null || y === undefined) return -1;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return dir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sort, dir, columns]);

  // Chip counts are computed over the SEARCH-filtered rows, so a chip never
  // promises rows a search has already excluded.
  const allGroups = useMemo(
    () => (grouping ? sortGroups(groupRows(sorted, grouping.of), grouping.order) : []),
    [sorted, grouping],
  );

  const focusedRows = useMemo(
    () => (focused ? sorted.filter((r) => (grouping?.of(r) || UNGROUPED) === focused) : sorted),
    [sorted, focused, grouping],
  );

  // Ungrouped and focused views paginate rows; the grouped overview paginates
  // whole groups.
  const grouped = Boolean(grouping) && !focused;
  const units = grouped ? allGroups : focusedRows;
  const pageCount = Math.max(1, Math.ceil(units.length / size));
  const clamped = Math.min(page, pageCount);
  const slice = units.slice((clamped - 1) * size, clamped * size);

  if (!rows.length) return empty ?? null;

  const headers = (
    <tr>
      {columns.map((c) => (
        <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}>
          {c.sortable === false ? (
            c.label
          ) : (
            <button
              onClick={() => update({ sort: c.key, dir: sort === c.key && dir === "asc" ? "desc" : "asc", page: 1 })}
              aria-label={`Sort by ${c.label}`}
            >
              {c.label}
              {sort === c.key ? (dir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          )}
        </th>
      ))}
    </tr>
  );

  const cells = (row) =>
    columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? <span className="faint">—</span>)}</td>);

  return (
    <>
      <div className="controls">
        {searchKeys.length ? (
          <input
            type="search"
            placeholder="Search"
            aria-label="Search"
            defaultValue={q}
            onChange={(e) => update({ q: e.target.value, page: 1 })}
            style={{ minWidth: 220 }}
          />
        ) : null}
        {groups ? (
          <label className="small muted">
            Group by{" "}
            <select
              value={groupKey}
              aria-label="Group by"
              onChange={(e) => update({ group: e.target.value, g: null, page: 1 })}
            >
              {groups.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
              <option value="none">None</option>
            </select>
          </label>
        ) : null}
        <span className="muted small">
          {grouped
            ? `${allGroups.length} ${allGroups.length === 1 ? "group" : "groups"} · ${sorted.length} of ${rows.length}`
            : `${focusedRows.length} of ${rows.length}`}
        </span>
        <div className="spacer" />
        <label className="small muted">
          Rows{" "}
          <select value={size} onChange={(e) => update({ size: e.target.value, page: 1 })} aria-label="Rows per page">
            {pageSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {/* The chip row is the fastest path to "show me just this product". */}
      {grouping && allGroups.length > 1 ? (
        <div className="chips" role="group" aria-label={`Filter by ${grouping.label}`}>
          <button className="chip" aria-pressed={!focused} onClick={() => update({ g: null, page: 1 })}>
            All <span className="faint">{sorted.length}</span>
          </button>
          {allGroups.map((g) => (
            <button
              key={g.key}
              className="chip"
              aria-pressed={focused === g.key}
              onClick={() => update({ g: focused === g.key ? null : g.key, page: 1 })}
            >
              {g.key} <span className="faint">{g.rows.length}</span>
            </button>
          ))}
        </div>
      ) : null}

      <table>
        <thead>{headers}</thead>
        {grouped ? (
          slice.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <tbody key={g.key}>
                <tr className="grouphead">
                  {/* The flex row is an inner div, not the cell itself:
                      `display:flex` on a td cancels its colSpan and the header
                      bar collapses to the width of the first column. */}
                  <td colSpan={columns.length}>
                    <div className="groupbar">
                    <button
                      className="groupToggle"
                      aria-expanded={!isCollapsed}
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          next.has(g.key) ? next.delete(g.key) : next.add(g.key);
                          return next;
                        })
                      }
                    >
                      <span aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span> {g.key}
                      <span className="badge">{g.rows.length}</span>
                    </button>
                    {groupSummary ? <span className="small muted">{groupSummary(g.rows)}</span> : null}
                    <button className="linkish small" onClick={() => update({ g: g.key, page: 1 })}>
                      Only this
                    </button>
                    </div>
                  </td>
                </tr>
                {isCollapsed ? null : g.rows.map((row, i) => <tr key={row.key ?? i}>{cells(row)}</tr>)}
              </tbody>
            );
          })
        ) : (
          <tbody>
            {slice.map((row, i) => (
              <tr key={row.key ?? i}>{cells(row)}</tr>
            ))}
          </tbody>
        )}
      </table>

      {slice.length === 0 ? <div className="state">No rows match “{q}”.</div> : null}

      <div className="pager">
        <button onClick={() => update({ page: clamped - 1 })} disabled={clamped <= 1}>Previous</button>
        <span className="small muted">
          Page {clamped} of {pageCount}
        </span>
        <button onClick={() => update({ page: clamped + 1 })} disabled={clamped >= pageCount}>Next</button>
      </div>
    </>
  );
}
