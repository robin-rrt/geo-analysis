// WCAG AA over the actual token file, in both themes.
//
// The brand blue fails on the brand dark — 2.92:1 — so dark mode deliberately
// uses a different accent. That is exactly the kind of decision someone
// "corrects" later, so it is asserted rather than trusted to a comment.

import fs from "node:fs";

const css = fs.readFileSync("ui/src/theme/tokens.css", "utf8");

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
export const contrast = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Tokens from a block, so the check reads the real file rather than a copy. */
function tokensIn(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2].toLowerCase();
  return out;
}

const light = tokensIn(css.slice(css.indexOf(":root {"), css.indexOf("@media")));
const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'));
const dark = { ...light, ...tokensIn(darkBlock.slice(0, darkBlock.indexOf("}"))) };

// Foreground/background pairings the UI actually renders.
const PAIRS = [
  ["text", "bg"], ["text", "surface"],
  ["muted", "bg"], ["muted", "surface"],
  ["accent", "bg"], ["accent", "surface"],
  ["band-poor", "bg"], ["band-developing", "bg"], ["band-good", "bg"],
  ["band-strong", "bg"], ["band-exemplary", "bg"],
  ["ok", "bg"], ["warn", "bg"], ["sev-high", "bg"],
];

let failed = 0;
for (const [theme, tokens] of [["light", light], ["dark", dark]]) {
  console.log(`\n${theme}`);
  for (const [fg, bg] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) continue;
    const r = contrast(tokens[fg], tokens[bg]);
    // Bands and status colours label data rather than carry body text, so they
    // are held to the large-text threshold; everything else to 4.5.
    const large = fg.startsWith("band-") || ["ok", "warn", "sev-high"].includes(fg);
    const min = large ? 3 : 4.5;
    const pass = r >= min;
    if (!pass) failed++;
    console.log(`  ${(fg + " on " + bg).padEnd(30)} ${r.toFixed(2).padStart(6)}  ${pass ? "pass" : "FAIL"} (needs ${min})`);
  }
}

// Dark is declared twice — once for the media query, once for the explicit
// toggle — and CSS gives no way to share them. They drifted apart the first
// time this palette changed, leaving the explicit toggle on the old colours
// while the media query was correct. Compare them rather than trust formatting.
const mediaBlock = css.slice(css.indexOf("prefers-color-scheme: dark"));
const mediaDark = tokensIn(mediaBlock.slice(0, mediaBlock.indexOf("\n  }")));
const explicitBlock = css.slice(css.indexOf('[data-theme="dark"] {'));
const explicitDark = tokensIn(explicitBlock.slice(0, explicitBlock.indexOf("\n}")));

for (const key of new Set([...Object.keys(mediaDark), ...Object.keys(explicitDark)])) {
  if (mediaDark[key] !== explicitDark[key]) {
    console.error(
      `\nFAIL: dark themes disagree on --${key} — ` +
        `media query says ${mediaDark[key] ?? "unset"}, explicit toggle says ${explicitDark[key] ?? "unset"}`,
    );
    failed++;
  }
}

if (dark.accent === "#0847f7") {
  console.error("\nFAIL: dark mode uses the brand blue, which measures 2.92:1 on the brand dark.");
  failed++;
}

console.log(failed ? `\n${failed} failing pair(s)` : "\nevery pairing passes WCAG AA");
process.exit(failed ? 1 : 0);
