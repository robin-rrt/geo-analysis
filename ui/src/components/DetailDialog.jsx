import { useEffect, useRef } from "react";

/**
 * Modal shell for "show me more about this one thing".
 *
 * Shared by the dimension tiles and the recommendation rows so the two cannot
 * drift into behaving differently — a dialog that closes on Escape in one place
 * and not another is worse than either choice made consistently.
 *
 * Native <dialog> for focus trapping, Escape, backdrop and inertness of the page
 * behind. Falling back to the open attribute where showModal is missing: jsdom
 * has no <dialog> at all, and throwing inside an effect would blank the page.
 */
export function DetailDialog({ open, title, subtitle, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    }
    if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);

  // Escape and backdrop dismissal fire the dialog's own close event, so parent
  // state has to follow that rather than only the button.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => onClose?.();
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

  return (
    <dialog className="detail" ref={ref} aria-labelledby="detail-dialog-title">
      {open ? (
        <>
          <header>
            <div>
              <h3 id="detail-dialog-title">{title}</h3>
              {subtitle ? <div className="small muted" style={{ marginTop: 2 }}>{subtitle}</div> : null}
            </div>
            <button className="close" onClick={() => onClose?.()} aria-label="Close">×</button>
          </header>
          <div className="body">{children}</div>
        </>
      ) : null}
    </dialog>
  );
}
