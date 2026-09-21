import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * The workhorse table: pagination, sort, filter and search, all synced to the URL.
 *
 * URL-as-state is the point. "Look at this page's regression" has to be a link
 * someone can paste, so every view must be reproducible from its address.
 */
export function DataTable({ rows, columns, pageSizes = [25, 50, 100], searchKeys = [], empty }) {
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? columns[0]?.key;
  const dir = params.get("dir") === "desc" ? "desc" : "asc";
  const size = Number(params.get("size") ?? pageSizes[0]);
  const page = Math.max(1, Number(params.get("page") ?? 1));

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
      return dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort, dir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const clamped = Math.min(page, pageCount);
  const slice = sorted.slice((clamped - 1) * size, clamped * size);

  if (!rows.length) return empty ?? null;

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
        <span className="muted small">
          {sorted.length} of {rows.length}
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

      <table>
        <thead>
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
        </thead>
        <tbody>
          {slice.map((row, i) => (
            <tr key={row.key ?? i}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? <span className="faint">—</span>)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {slice.length === 0 ? <div className="state">No rows match “{q}”.</div> : null}

      <div className="pager">
        <button onClick={() => update({ page: clamped - 1 })} disabled={clamped <= 1}>Previous</button>
        <span className="small muted">Page {clamped} of {pageCount}</span>
        <button onClick={() => update({ page: clamped + 1 })} disabled={clamped >= pageCount}>Next</button>
      </div>
    </>
  );
}
