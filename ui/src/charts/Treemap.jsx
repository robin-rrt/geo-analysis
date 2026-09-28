import { useEffect, useRef, useState } from "react";

/**
 * Squarified treemap, laid out in HTML rather than SVG.
 *
 * Area needs no reading, which is the point: the largest rectangle answers
 * "what do I fix first" before anyone has read a word. A bar chart still asks
 * for length comparison, a scatter asks the reader to interpret two axes, and a
 * radar is poor at magnitude — the only thing that matters here.
 *
 * HTML, not SVG, because the first version put text inside an SVG with
 * `preserveAspectRatio="none"`. A 1000-unit viewBox rendering into a 2000px box
 * stretched every glyph horizontally by eight times. Text in a non-uniformly
 * scaled coordinate space is always going to distort; positioning plain
 * elements by percentage avoids the question entirely.
 *
 * Squarified rather than slice-and-dice: long thin slivers are hard to compare
 * and impossible to label. (Bruls, Huizing & van Wijk, 2000.)
 */

/**
 * Lay `values` out as rectangles filling `width` x `height`.
 * Returns one rect per input, in the caller's original order.
 */
export function squarify(values, width, height) {
  const out = values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const total = values.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (!total || !width || !height) return out;

  const remaining = values
    .map((value, index) => ({ value, index }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  let x = 0, y = 0, w = width, h = height;
  let left = total;

  while (remaining.length) {
    const vertical = w >= h;
    const side = vertical ? h : w;

    const row = [];
    let rowSum = 0;
    let bestRatio = Infinity;

    while (remaining.length) {
      const trySum = rowSum + remaining[0].value;
      const depth = (trySum / left) * (vertical ? w : h);
      const candidates = [...row.map((r) => r.value), remaining[0].value];
      const tryRatio = Math.max(
        ...candidates.map((v) => {
          const len = (v / trySum) * side;
          return len > 0 ? Math.max(depth / len, len / depth) : Infinity;
        }),
      );
      if (row.length && tryRatio > bestRatio) break;
      bestRatio = tryRatio;
      rowSum = trySum;
      row.push(remaining.shift());
    }

    const depth = (rowSum / left) * (vertical ? w : h);
    let offset = 0;
    for (const item of row) {
      const len = (item.value / rowSum) * side;
      out[item.index] = vertical
        ? { x, y: y + offset, w: depth, h: len }
        : { x: x + offset, y, w: len, h: depth };
      offset += len;
    }

    if (vertical) { x += depth; w -= depth; } else { y += depth; h -= depth; }
    left -= rowSum;
  }

  return out;
}

/** The container's real width, so cells are laid out at the aspect they render at. */
function useWidth(ref, fallback = 900) {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * @param {{ label: string, value: number, detail?: string }[]} items
 */
export function Treemap({ items = [], height = 260, onSelect, emptyLabel = "Nothing to show." }) {
  const ref = useRef(null);
  const width = useWidth(ref);

  const usable = items.filter((i) => Number.isFinite(i.value) && i.value > 0);
  // Laid out at the real aspect ratio. Squarifying into a square and then
  // stretching to a wide box would undo the squarifying.
  const rects = squarify(usable.map((i) => i.value), width, height);
  const max = usable.length ? Math.max(...usable.map((i) => i.value)) : 0;

  return (
    <div
      ref={ref}
      style={{ position: "relative", width: "100%", height }}
      role="img"
      aria-label={
        usable.length
          ? "Points recoverable by rubric dimension, largest first: " +
            [...usable].sort((a, b) => b.value - a.value)
              .map((i) => `${i.label}, ${i.value.toFixed(1)} points`).join("; ")
          : emptyLabel
      }
    >
      {!usable.length ? <div className="state small">{emptyLabel}</div> : null}

      {usable.map((item, i) => {
        const r = rects[i];
        if (r.w < 2 || r.h < 2) return null;

        // Strength carries magnitude a second time, so ranking survives when two
        // rectangles come out similar in area.
        const strength = 0.3 + 0.7 * (item.value / max);
        // Below this the tile is too pale for white text; the label flips to ink
        // rather than sitting at 2:1 against its own background.
        return (
          <button
            type="button"
            key={item.label}
            className="tm-tile"
            data-value={item.value}
            aria-label={`${item.label}, ${item.value.toFixed(1)} points recoverable. Open details.`}
            onClick={() => onSelect?.(item)}
            style={{
              left: r.x, top: r.y,
              width: Math.max(0, r.w - 4), height: Math.max(0, r.h - 4),
              opacity: strength,
            }}
          />
        );
      })}

      {/* Labels sit in their own layer so tile opacity never fades the text. */}
      {usable.map((item, i) => {
        const r = rects[i];
        if (r.w < 2 || r.h < 2) return null;
        const strength = 0.3 + 0.7 * (item.value / max);
        const onDark = strength >= 0.55;
        const showValue = r.w > 74 && r.h > 40;
        const showLabel = r.w > 130 && r.h > 66;
        if (!showValue) return null;

        return (
          <div
            key={`${item.label}-label`}
            className="tm-label"
            style={{
              left: r.x + 14, top: r.y + 10,
              width: Math.max(0, r.w - 28),
              // Strong tiles take the theme's tile ink; pale ones take body
              // text, which is already correct for the background behind them.
              color: onDark ? "var(--tile-ink-strong)" : "var(--text)",
            }}
          >
            <div
              style={{
                fontFamily: '"TASA Orbiter Variable", ui-sans-serif, system-ui, sans-serif',
                fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em",
                lineHeight: 1.1, fontVariantNumeric: "tabular-nums",
              }}
            >
              +{item.value.toFixed(1)}
            </div>
            {showLabel ? (
              <div
                style={{
                  fontSize: 12, lineHeight: 1.3, marginTop: 3,
                  opacity: onDark ? 0.9 : 0.75,
                  // Wrap to two lines rather than truncating mid-word. A name
                  // cut to "Citations & authoritative ref…" reads worse than
                  // the same name over two lines.
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {item.label}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
