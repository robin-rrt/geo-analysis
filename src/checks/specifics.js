// Specifics checks — how much of the page is concrete rather than qualitative.
//
// Counting numerals is a proxy, not a measure of substance. A page can be dense
// with version strings and still vague about what matters. Treat these as a
// density signal and let the auditor judge whether the specifics are the right ones.

// Qualifiers that tend to stand in for a number the reader actually needed.
const VAGUE_QUANTIFIERS = [
  "many", "several", "various", "numerous", "a number of", "some", "most",
  "broad set of", "wide range", "significant", "substantial", "considerable",
  "high performance", "low latency", "fast", "quickly", "robust", "scalable",
];

const FENCED_BLOCK = /^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1.*$/gm;

/** Strip fenced code so code identifiers don't inflate prose numeral counts. */
function proseOnly(markdown) {
  return markdown.replace(FENCED_BLOCK, "").replace(/`[^`]*`/g, "");
}

/** Just the fenced code, so "no numbers in prose" can be distinguished from "no numbers". */
function codeOnly(markdown) {
  return (markdown.match(FENCED_BLOCK) ?? []).join("\n");
}

export function checkSpecifics({ markdown = "" }) {
  const prose = proseOnly(markdown);
  const words = prose.trim() ? prose.trim().split(/\s+/).length : 0;

  const numerals = [...prose.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0]);

  // Units and magnitudes: the numbers that carry engineering meaning.
  const measurements = [
    ...prose.matchAll(/\b\d[\d,.]*\s?(ms|s|sec|seconds?|minutes?|hours?|days?|gwei|wei|eth|gb|mb|kb|bytes?|%|x)\b/gi),
  ].length;

  const versions = [...prose.matchAll(/\bv?\d+\.\d+(?:\.\d+)?\b/g)].map((m) => m[0]);

  // Hex addresses and selectors — the most concrete thing an onchain doc can carry.
  const hexIdentifiers = [...prose.matchAll(/\b0x[a-fA-F0-9]{6,}\b/g)].length;

  const lower = prose.toLowerCase();
  const vagueHits = VAGUE_QUANTIFIERS.filter((q) => lower.includes(q));

  // Counted separately so "no numbers in the prose" is never mistaken for "no
  // numbers on the page" — a page whose only specifics live in code blocks is a
  // real and different situation, and the auditor should see both.
  const codeNumerals = [...codeOnly(markdown).matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?/g)].length;

  return {
    proseWordCount: words,
    numeralCount: numerals.length,
    codeNumeralCount: codeNumerals,
    // Per 1,000 words, so long and short pages compare fairly.
    numeralDensityPer1kWords: words ? Math.round((numerals.length / words) * 1000) : 0,
    measurementCount: measurements,
    versionStrings: [...new Set(versions)].slice(0, 10),
    hexIdentifierCount: hexIdentifiers,
    vagueQuantifiers: vagueHits,
    vagueQuantifierCount: vagueHits.length,
  };
}
