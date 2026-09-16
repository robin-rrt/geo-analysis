// Token accounting.
//
// Nothing recorded usage before this, so every cost figure in the plans was an
// estimate — including the ~$6 spent on the variance study, which still cannot
// be stated exactly. This module makes spend observable; it does not change it.
//
// Prices are a cached constant, not an API lookup. Each row carries the date it
// was checked so a stale table is visible rather than silently wrong.

/** USD per million tokens. Checked 2026-09-09 against the published pricing. */
export const PRICES = {
  "claude-opus-5": { input: 5, output: 25, checked: "2026-09-09" },
  "claude-opus-4-8": { input: 5, output: 25, checked: "2026-09-09" },
  "claude-opus-4-7": { input: 5, output: 25, checked: "2026-09-09" },
  "claude-sonnet-5": { input: 3, output: 15, checked: "2026-09-09" },
  "claude-sonnet-4-6": { input: 3, output: 15, checked: "2026-09-09" },
  "claude-fable-5": { input: 10, output: 50, checked: "2026-09-09" },
  "claude-haiku-4-5": { input: 1, output: 5, checked: "2026-09-09" },
};

// Cache writes cost 1.25x base input (5-minute TTL) or 2x (1-hour); reads cost
// 0.1x. We only ever write 5-minute entries today.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Cost of one call in USD. Returns null for an unknown model rather than
 * guessing — a wrong number is worse than an absent one.
 */
export function costOf(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return null;

  const uncachedIn = usage.input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const out = usage.output_tokens ?? 0;

  const perMillion = (tokens, rate) => (tokens / 1e6) * rate;
  return (
    perMillion(uncachedIn, price.input) +
    perMillion(cacheWrite, price.input * CACHE_WRITE_MULTIPLIER) +
    perMillion(cacheRead, price.input * CACHE_READ_MULTIPLIER) +
    perMillion(out, price.output)
  );
}

/**
 * Accumulator for one command invocation.
 *
 * `label` groups calls that mean different things — "audit", "grader",
 * "model-under-test" — because the interesting question is usually which stage
 * the money went to, not the total.
 */
export function createTally() {
  const calls = [];

  return {
    add(label, model, usage) {
      if (!usage) return;
      calls.push({
        label,
        model,
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cost: costOf(model, usage),
      });
    },

    get calls() {
      return calls;
    },

    /** Totals overall and per label, with costs left null when any model was unpriced. */
    summary() {
      const zero = () => ({ calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, priced: true });
      const add = (acc, c) => {
        acc.calls += 1;
        acc.input += c.input;
        acc.output += c.output;
        acc.cacheWrite += c.cacheWrite;
        acc.cacheRead += c.cacheRead;
        if (c.cost === null) acc.priced = false;
        else acc.cost += c.cost;
        return acc;
      };

      const byLabel = {};
      const totals = calls.reduce((acc, c) => {
        byLabel[c.label] ??= zero();
        add(byLabel[c.label], c);
        return add(acc, c);
      }, zero());

      // Cache effectiveness: what share of cacheable input was served from cache.
      const cacheable = totals.cacheRead + totals.cacheWrite;
      return {
        ...totals,
        cost: totals.priced ? round(totals.cost) : null,
        cacheHitRate: cacheable ? round(totals.cacheRead / cacheable, 3) : null,
        models: [...new Set(calls.map((c) => c.model))],
        byLabel: Object.fromEntries(
          Object.entries(byLabel).map(([k, v]) => [k, { ...v, cost: v.priced ? round(v.cost) : null }]),
        ),
      };
    },

    /** One-line-per-stage report for stderr. */
    format() {
      const s = this.summary();
      if (!s.calls) return "no API calls recorded";

      const money = (c) => (c === null ? "cost unknown (unpriced model)" : `$${c.toFixed(4)}`);
      const lines = [
        `tokens: ${s.input.toLocaleString()} in · ${s.output.toLocaleString()} out · ` +
          `${s.cacheWrite.toLocaleString()} cache-write · ${s.cacheRead.toLocaleString()} cache-read`,
      ];
      for (const [label, v] of Object.entries(s.byLabel)) {
        lines.push(
          `  ${label}: ${v.calls} call(s), ${v.input.toLocaleString()}+${v.cacheRead.toLocaleString()}c in / ` +
            `${v.output.toLocaleString()} out — ${money(v.cost)}`,
        );
      }
      if (s.cacheHitRate !== null) {
        lines.push(`  cache: ${Math.round(s.cacheHitRate * 100)}% of cacheable input served from cache`);
      }
      lines.push(`  estimated cost: ${money(s.cost)}  (prices checked ${PRICES["claude-opus-4-8"].checked})`);
      return lines.join("\n");
    },
  };
}

function round(n, dp = 4) {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}
