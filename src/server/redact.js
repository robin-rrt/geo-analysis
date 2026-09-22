// Keep secrets out of anything that leaves the process.
//
// The API key lives in the server process and must never reach a browser, a log
// line, or an error payload. Redaction is centralised so there is one place to
// audit rather than a discipline to remember at every call site.

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, // Anthropic keys
  /\bsk-[A-Za-z0-9]{20,}\b/g,
];

/** Replace any secret-looking substring, plus the live key if one is set. */
export function redact(input, env = process.env) {
  let text = typeof input === "string" ? input : JSON.stringify(input ?? null);
  const live = env.ANTHROPIC_API_KEY;
  // The live key is redacted by exact match too: a key that does not match the
  // shape patterns would otherwise slip through.
  if (live && live.length > 8) text = text.split(live).join("[redacted]");
  for (const p of SECRET_PATTERNS) text = text.replace(p, "[redacted]");
  return text;
}

/** Redact a value, preserving JSON structure where possible. */
export function redactValue(value, env = process.env) {
  if (value === null || value === undefined) return value;
  const text = redact(typeof value === "string" ? value : JSON.stringify(value), env);
  if (typeof value === "string") return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
