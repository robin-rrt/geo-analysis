// Which failures make continuing pointless.
//
// A run treats a failed page as isolated — one 404 must not discard the other
// 30 pages of paid work. But some failures are not about the page at all: an
// exhausted credit balance or a bad key fails every subsequent call identically.
//
// Grinding on produces one useless error per page and buries the real cause in
// the noise. A 119-page sweep did exactly that: 119 copies of "credit balance
// is too low", four minutes, no audits, and a failure list that looked like 119
// separate problems.

const FATAL_PATTERNS = [
  /credit balance is too low/i,
  /billing/i,
  /quota (has been )?exceeded/i,
  /authentication_error/i,
  /could not resolve authentication method/i,
  /invalid[_ ]api[_ ]key/i,
  /permission[_ ]error/i,
  /account.*(suspended|disabled)/i,
];

/**
 * Is this an account-level failure rather than a page-level one?
 *
 * Deliberately narrow. Rate limits and overloads are NOT fatal — they are
 * transient and already retried, and aborting a long run because one request
 * was throttled would throw away work that would have succeeded.
 */
export function isFatalError(error) {
  const text = typeof error === "string" ? error : (error?.message ?? String(error ?? ""));
  if (!text) return false;
  if (/rate[_ ]limit/i.test(text) || /overloaded/i.test(text) || /\b529\b/.test(text)) return false;
  return FATAL_PATTERNS.some((p) => p.test(text));
}

/** A short reason suitable for a manifest and a UI line. */
export function fatalReason(error) {
  const text = typeof error === "string" ? error : (error?.message ?? String(error ?? ""));
  if (/credit balance is too low/i.test(text)) return "Anthropic credit balance exhausted";
  if (/could not resolve authentication method/i.test(text)) return "no API credentials found";
  if (/invalid[_ ]api[_ ]key/i.test(text)) return "invalid API key";
  if (/authentication_error/i.test(text)) return "authentication rejected";
  if (/quota/i.test(text)) return "quota exceeded";
  return "account-level failure";
}
