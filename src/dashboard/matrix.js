// Probe × run table for one page: one row per probe in the current probe set,
// one column per run (model × mode). Pure, so probe-matrix.csv and the
// dashboard render the same numbers. Callers pass current runs only — a run on
// an older probe set answered different questions.

export const runKey = (run) => `${run.model}|${run.mode}`;

/** `runs` are normalised probe runs (see collect.js), newest first; `probes` from probes.json. */
export function pivotRuns(runs, probes) {
  // One column per model × mode: the newest run wins if a key repeats.
  const seen = new Set();
  const unique = runs.filter((run) => !seen.has(runKey(run)) && seen.add(runKey(run)));

  const columns = unique.map((run) => ({
    key: runKey(run),
    model: run.model,
    mode: run.mode,
    runAt: run.runAt,
    graderModel: run.graderModel,
    graded: run.probes.filter((p) => Number.isFinite(p.fidelity)).length,
    total: probes.length,
  }));

  const rows = probes.map((probe) => ({
    id: probe.id,
    archetype: probe.archetype,
    prompt: probe.prompt,
    cells: Object.fromEntries(
      unique.map((run) => {
        const p = run.probes.find((x) => x.id === probe.id);
        return [
          runKey(run),
          p
            ? {
                fidelity: p.fidelity,
                hit: p.hit,
                via: p.via,
                highSev: p.hallucinations.filter((h) => h.severity === "high").length,
                stop: p.stop,
              }
            : null,
        ];
      }),
    ),
  }));

  return { columns, rows };
}

/** RFC 4180 field: quoted when it contains a comma, quote, or line break. */
function csvField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * One row per probe; per column: fidelity, hit (1/0), high-severity
 * hallucination count. Unknowns are empty, never 0: a probe the run lacks, a
 * refusal or failure (nothing graded), and closed-mode hits (no retrieval).
 */
export function toCsv({ columns, rows }) {
  const header = [
    "probe_id",
    "archetype",
    "prompt",
    ...columns.flatMap((c) => [`${c.key} fidelity`, `${c.key} hit`, `${c.key} high_sev`]),
  ];
  const lines = rows.map((row) => [
    row.id,
    row.archetype,
    row.prompt,
    ...columns.flatMap((c) => {
      const cell = row.cells[c.key];
      if (!cell || !Number.isFinite(cell.fidelity)) return ["", "", ""];
      return [cell.fidelity, cell.hit === null ? "" : cell.hit ? 1 : 0, cell.highSev];
    }),
  ]);
  return [header, ...lines].map((fields) => fields.map(csvField).join(",")).join("\r\n") + "\r\n";
}
