import { useEffect, useRef } from "react";

/**
 * Details for one rubric dimension, on demand.
 *
 * The auditor's critique is the most useful text on the page and the least
 * glanceable — nine of them stacked is what made this section skippable. Behind
 * a click it costs nothing until someone wants it.
 *
 * A native <dialog> rather than a div: it brings focus trapping, Escape to
 * close, a backdrop, and inertness of the page behind it, all of which would
 * otherwise be hand-rolled and got wrong.
 */
export function DimensionDialog({ dimension, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // showModal() is absent in jsdom and in browsers predating <dialog>.
    // Falling back to the open attribute renders the panel non-modally rather
    // than throwing inside an effect, which would blank the whole page.
    if (dimension && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    }
    if (!dimension && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [dimension]);

  // Escape and backdrop dismissal fire the dialog's own close event, so the
  // parent's state has to follow it rather than only the button.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => onClose?.();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

  const d = dimension;

  return (
    <dialog className="detail" ref={ref} aria-labelledby="dim-dialog-title">
      {d ? (
        <>
          <header>
            <div>
              <h3 id="dim-dialog-title">{d.name}</h3>
              <div className="small muted" style={{ marginTop: 2 }}>
                {d.score}/10 · weight {d.weight} of 100
              </div>
            </div>
            <button className="close" onClick={() => onClose?.()} aria-label="Close">×</button>
          </header>

          <div className="body">
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
                <div className="figure-note">
                  {d.weight} of the 100 available ride on this
                </div>
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
          </div>
        </>
      ) : null}
    </dialog>
  );
}
