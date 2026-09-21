// Single-page target.

import { makeTarget } from "./index.js";

export function resolvePageTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a valid URL`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`"${url}" must be http or https`);
  }
  return makeTarget({
    type: "page",
    name: url,
    origin: parsed.origin,
    pages: [{ url, source: "explicit" }],
    ledger: [{ url, source: "explicit", included: true }],
  });
}
