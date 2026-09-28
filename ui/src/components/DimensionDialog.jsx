import { DetailDialog } from "./DetailDialog.jsx";

/**
 * Details for one rubric dimension, on demand.
 *
 * The auditor's critique is the most useful text on the page and the least
 * glanceable — nine stacked is what made this section skippable. Behind a click
 * it costs nothing until someone wants it.
 */
export function DimensionDialog({ dimension, onClose }) {
  const d = dimension;
  return (
    <DetailDialog
      open={Boolean(d)}
      title={d?.name}
      subtitle={d ? `${d.score}/10 · weight ${d.weight} of 100` : null}
      onClose={onClose}
    >
      {d ? (
        <>
          <div className="figure-row">
            <div className="figure">
              <div className="figure-value" style={{ color: "var(--accent)" }}>
                +{(d.gain ?? 0).toFixed(1)}
              </div>
              <div className="figure-label">Points recoverable</div>
              <div className="figure-note">weight × the share still missing</div>
            </div>
            <div className="figure">
              <div className="figure-value">{d.score}<span className="measure-of">/10</span></div>
              <div className="figure-label">Scored</div>
              <div className="figure-note">{d.weight} of the 100 available ride on this</div>
            </div>
          </div>

          {d.analysis ? (
            <>
              <h2 style={{ marginTop: "var(--s5)" }}>Why it scored that way</h2>
              <p className="note" style={{ marginTop: 0 }}>{d.analysis}</p>
            </>
          ) : (
            <p className="note">
              The auditor recorded a score but no written critique for this dimension.
            </p>
          )}
        </>
      ) : null}
    </DetailDialog>
  );
}
