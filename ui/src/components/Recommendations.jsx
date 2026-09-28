import { useState } from "react";
import { DetailDialog } from "./DetailDialog.jsx";

/**
 * The auditor's prioritised fixes.
 *
 * Each one carries four fields — where on the page, what the issue is, what to
 * change, and why it matters — and the page was rendering none of them: the
 * markup read `r.meta` and `r.body`, which the parser never produces. Every
 * recommendation showed as a bare title with all its substance invisible.
 *
 * Rather than pour four paragraphs per fix back onto the page, the list stays a
 * list and the detail sits behind a click. A page with eight P1s is a wall of
 * text otherwise, which is the same thing that made the dimensions section
 * skippable.
 */
const TONE = { 1: "var(--sev-high)", 2: "var(--sev-med)", 3: "var(--sev-low)" };

/** The whole fix as plain text, for the hover tooltip. */
function fullText(r) {
  return [
    r.where && `Where: ${r.where}`,
    r.issue && `Issue: ${r.issue}`,
    r.change && `Change: ${r.change}`,
    r.why && `Why it lifts GEO: ${r.why}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function Recommendations({ recommendations = [] }) {
  const [open, setOpen] = useState(null);
  if (!recommendations.length) return null;

  return (
    <div>
      {recommendations.map((r, i) => (
        <button
          type="button"
          key={`${r.priority}-${r.title}-${i}`}
          className="rec"
          onClick={() => setOpen(r)}
          /* Hover gives the full text without a click. A native title is the
             only tooltip that survives being rendered into the single-file
             export with no JS-driven positioning to go wrong. */
          title={fullText(r) || undefined}
          aria-label={`Priority ${r.priority}: ${r.title}. Open details.`}
        >
          <span className="rec-pri" style={{ color: TONE[r.priority] ?? "var(--muted)" }}>
            P{r.priority}
          </span>
          <span>
            <span className="rec-title">{r.title}</span>
            {/* One line of context, not four. The rest is a click away. */}
            {r.mapsTo ? <span className="rec-maps"> — {r.mapsTo}</span> : null}
          </span>
          <span className="rec-more" aria-hidden="true">→</span>
        </button>
      ))}

      <DetailDialog
        open={Boolean(open)}
        title={open?.title}
        subtitle={
          open
            ? `Priority ${open.priority}${open.mapsTo ? ` · maps to ${open.mapsTo}` : ""}${open.tier ? ` · ${open.tier}` : ""}`
            : null
        }
        onClose={() => setOpen(null)}
      >
        {open ? (
          <>
            {open.where ? (
              <>
                <h2>Where</h2>
                <p className="note" style={{ marginTop: 0 }}>{open.where}</p>
              </>
            ) : null}
            {open.issue ? (
              <>
                <h2 style={{ marginTop: "var(--s5)" }}>The issue</h2>
                <p className="note" style={{ marginTop: 0 }}>{open.issue}</p>
              </>
            ) : null}
            {open.change ? (
              <>
                <h2 style={{ marginTop: "var(--s5)" }}>What to change</h2>
                <p className="note" style={{ marginTop: 0 }}>{open.change}</p>
              </>
            ) : null}
            {open.why ? (
              <>
                <h2 style={{ marginTop: "var(--s5)" }}>Why it matters</h2>
                <p className="note" style={{ marginTop: 0 }}>{open.why}</p>
              </>
            ) : null}
            {/* A recommendation with none of the four is worth saying so, rather
                than opening an empty panel. */}
            {!open.where && !open.issue && !open.change && !open.why ? (
              <p className="note" style={{ marginTop: 0 }}>
                The auditor recorded this fix without a written breakdown.
              </p>
            ) : null}
          </>
        ) : null}
      </DetailDialog>
    </div>
  );
}
