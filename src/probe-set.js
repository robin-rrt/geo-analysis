// Identity for probe sets and the page content they were derived from. Runs
// are only comparable when they answered the same probe set, so this is what
// resume, staleness, and the probe × model matrix key on.

import crypto from "node:crypto";

const sha12 = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);

/** JSON with object keys sorted, so reformatting or key reordering can't change a hash. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Hash of the extracted page markdown the answer keys were derived from. */
export function sourceHash(markdown) {
  return sha12(markdown);
}

/**
 * Hash of the probes themselves — prompts, answer keys, expected URLs. Set-level
 * metadata (generated_at, which the generator model has been seen to invent)
 * is deliberately outside it. Always computed from content, never trusted from
 * a stored field, so a hand-edited probes.json can't keep a stale id.
 */
export function probeSetId(probes) {
  return sha12(canonical(probes));
}
