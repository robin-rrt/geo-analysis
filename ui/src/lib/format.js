/** Human durations. Runs span seconds to tens of minutes, so no single unit works. */
export function duration(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const money = (n) => (Number.isFinite(n) ? `$${n.toFixed(2)}` : "—");

/** What a stage did, as a word a reader can act on. */
export const STAGE_OUTCOME = {
  ran: { label: "ran", tone: "var(--accent)" },
  reused: { label: "reused", tone: "var(--muted)" },
  skipped: { label: "skipped", tone: "var(--muted)" },
};
