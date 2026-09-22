// The five rubric bands and their thresholds.
//
// Shared rather than duplicated per component: a band boundary that disagrees
// between the colour and the label is the kind of inconsistency nobody notices
// until a number sits right on 70.

export const BANDS = [
  { min: 85, name: "Exemplary", colour: "var(--band-exemplary)" },
  { min: 70, name: "Strong", colour: "var(--band-strong)" },
  { min: 55, name: "Good", colour: "var(--band-good)" },
  { min: 40, name: "Developing", colour: "var(--band-developing)" },
  { min: 0, name: "Poor", colour: "var(--band-poor)" },
];

const has = (v) => v !== null && v !== undefined && Number.isFinite(v);

export const bandFor = (v) => (has(v) ? BANDS.find((b) => v >= b.min) : null);
export const bandColour = (v) => bandFor(v)?.colour ?? "var(--faint)";
export const bandName = (v) => bandFor(v)?.name ?? null;

/** Ascending thresholds, for drawing the scale. */
export const THRESHOLDS = [...BANDS].reverse();
