/**
 * Squarified treemap.
 *
 * Chosen over a bar chart, a radar, or a scatter for one reason: area needs no
 * reading. A bar chart of nine dimensions still asks the reader to scan and
 * compare lengths. A scatter of score against weight asks them to interpret two
 * axes. A treemap sized by what each gap COSTS answers "what do I fix first"
 * before anyone has read a word — the biggest rectangle is the answer.
 *
 * Squarified rather than naive slice-and-dice: long thin slivers are both hard
 * to compare by eye and impossible to label.
 * (Bruls, Huizing & van Wijk, 2000.)
 */

/**
 * Lay `values` out as rectangles filling `width` x `height`.
 * Returns one rect per input, in the caller's original order.
 */
export function squarify(values, width, height) {
  const out = values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const total = values.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (!total || !width || !height) return out;

  // Index-carrying copies, so sorting by size does not disturb the caller's order.
  const remaining = values
    .map((value, index) => ({ value, index }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  let x = 0, y = 0, w = width, h = height;
  let left = total;

  while (remaining.length) {
    // Always lay the next row along the shorter side; that is what keeps cells
    // near square as the space narrows.
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
      // Adding this item made the row less square — stop and lay it out.
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

/**
 * @param {{ label: string, value: number, detail?: string }[]} items
 */
export function Treemap({ items = [], height = 240, emptyLabel = "Nothing to show." }) {
  const usable = items.filter((i) => Number.isFinite(i.value) && i.value > 0);
  if (!usable.length) return <div className="state small">{emptyLabel}</div>;

  const W = 1000;
  const H = Math.round((height / 1000) * 1000 * (1000 / 1000)) || height;
  const VH = Math.round((height / 240) * 240 * 4.1); // viewBox height, tuned for legible type
  const rects = squarify(usable.map((i) => i.value), W, VH);
  const max = Math.max(...usable.map((i) => i.value));

  return (
    <svg
      viewBox={`0 0 ${W} ${VH}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={
        `Points recoverable by rubric dimension, largest first: ` +
        [...usable]
          .sort((a, b) => b.value - a.value)
          .map((i) => `${i.label}, ${i.value.toFixed(1)} points`)
          .join("; ")
      }
      style={{ display: "block" }}
    >
      {usable.map((item, i) => {
        const r = rects[i];
        if (!r.w || !r.h) return null;
        // Opacity restates magnitude, so ranking survives when two rectangles
        // come out similar in area.
        const strength = 0.22 + 0.78 * (item.value / max);
        const room = r.w > 190 && r.h > 90;
        const tight = r.w > 110 && r.h > 52;

        return (
          <g key={item.label}>
            <rect
              x={r.x + 3} y={r.y + 3}
              width={Math.max(0, r.w - 6)} height={Math.max(0, r.h - 6)}
              rx="8" fill="var(--accent)" fillOpacity={strength}
            />
            <title>
              {`${item.label} — ${item.value.toFixed(1)} points recoverable${item.detail ? ` (${item.detail})` : ""}`}
            </title>

            {/* Labels only where they fit. A clipped label is worse than none,
                and a small cell is small precisely because it matters least. */}
            {tight ? (
              <text
                x={r.x + 20} y={r.y + 48} fill="var(--bg)"
                style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", pointerEvents: "none" }}
              >
                +{item.value.toFixed(1)}
              </text>
            ) : null}
            {room ? (
              <text
                x={r.x + 20} y={r.y + 78} fill="var(--bg)" fillOpacity="0.85"
                style={{ fontSize: 18, pointerEvents: "none" }}
              >
                {item.label.length > Math.floor(r.w / 10)
                  ? `${item.label.slice(0, Math.floor(r.w / 10) - 1)}…`
                  : item.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
