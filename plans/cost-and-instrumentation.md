# perf: instrument token spend, then cut it (batch, cache, model tiering, effort)

**Type:** enhancement
**Created:** 2026-09-09
**Status:** planned

## Overview

Make `geo-audit`'s API spend visible, then reduce it. The tool currently records **no token
usage anywhere**, so every cost claim — including the ones in this plan — is inference from
input sizes rather than measurement. Phase 1 fixes that and gates everything after it.

## Correcting the premise

This work started from "we waste a ton of tokens on LLMs parsing web content each time."
**That is not happening.** `src/extract.js` converts HTML to Markdown with cheerio + turndown —
deterministic, zero tokens. An external scraping service would replace a step that already
costs nothing.

Measured with `messages.count_tokens` against `claude-opus-4-8`:

| Component | Tokens |
|---|--:|
| `prompts/geo-audit.md` (system) | 5,048 |
| `prompts/gen-probes.md` (system) | 1,369 |
| `prompts/probe-eval.md` (system) | 1,427 |
| Extracted page markdown | 3,047 |
| Answer keys ×10 | 2,926 |
| One model answer (avg of 10) | 1,224 |

A full `score` request sends roughly **9k input tokens ≈ $0.045** at Opus 4.8's $5/MTok.

> **Measured 2026-09-16, once Phase 1 landed.** A real `score` run on `docs.chain.link/ace`:
> 6,113 fresh input + 5,557 cache-write + 4,380 output = **$0.1748**. Every pre-instrumentation
> estimate in this plan (and the ~$0.30/audit figure used to price the variance study) was
> **~70% too high**; the 18-audit study actually cost ~$3.15, not ~$6.
>
> It also exposed a small real waste: **cache hit rate is 0% on a single `score` run.** The
> system prompt is written to cache at 1.25× and never read, because one audit is one call —
> costing ~$0.007 more than not caching. The breakpoint only pays across several calls inside
> the 5-minute TTL (probe runs, or concurrent audits). Not worth removing, worth knowing.

**Corpus-wide token distribution** (measured by the teammate's crawler across 906 markdown
bodies on `docs.chain.link`): median **1,415**, p95 **6,246**, max **136,605**. The 3,047-token
page above is above median; the median page is cheaper still. But **the tail is a real hazard** —
`score` sends the whole page, so the 136K-token page costs ~$0.68 in input alone before any
thinking, and eats meaningful context. Add a size guard before running `score` across a corpus:
skip, chunk, or flag above a threshold. Do not send any page blindly.

**Input is not the cost.** The spend is:

1. **Output + thinking at $25/MTok**, at `--effort high` on every call.
2. **`probe --mode web`**, which is ~10× a `score` run: each of 10 probes runs a
   model-under-test turn pulling up to 5 web-search results into context (`max_uses: 5`,
   `src/evaluate.js:132`), *plus* a second grader call.

## Problem statement

- **Spend is unmeasured.** `runClaude` (`src/claude.js:75`) reads `final.usage` only to detect a
  fallback; `executeProbeOnce` never touches `usage`. Nothing is persisted. You cannot tune what
  you cannot see, and every optimization below needs a before/after number.
- **Grading is billed at interactive rates** though it is entirely non-interactive — a textbook
  Batch API workload at 50% off.
- **Everything runs on Opus 4.8 at `--effort high`**, including grading, which is a constrained
  task with an answer key and a fixed source.
- **A cache inefficiency was introduced by the concurrency change** (see Phase 3).

## Phase 1 — Record usage (gates everything else)

Capture `usage` from every API call and persist it. Without this, Phases 2–5 are unfalsifiable.

`runClaude` already has the response object; add `usage` to what it returns (it currently
returns bare text or parsed JSON, so this is a shape change — return `{ result, usage }` and
update the three call sites, or attach usage via an out-param callback to avoid churn).

Fields to record per call: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens`, and `server_tool_use` counts where present.

```js
// src/usage.js — accumulate per run, emit one summary
export function tally() {
  const calls = [];
  return {
    add(label, usage, model) { calls.push({ label, model, ...usage }); },
    summary() {
      // per-model totals + estimated cost from a local PRICES table
      // (prices are cached constants — annotate them with the date they were checked)
    },
  };
}
```

Write the tally into the run artifacts: `probe-results-*.json` gains a `usage` block, and
`score` prints a one-line cost summary to stderr. The dashboard's Methodology page then has a
real cost column instead of nothing.

**Status 2026-09-16: partially done.** `src/usage.js` + `runClaude` instrumentation covers
`score`, `gen-probes`, and the **grader** (all three route through `runClaude`). The
model-under-test path in `executeProbeOnce` calls the SDK directly and is **deliberately not
wired yet** — `src/evaluate.js` is being rewritten concurrently by the multi-model PR1 work, and
touching it now would collide. Wire it once PR1 lands.

**Done when:** a `probe` run reports total input/output/cache tokens per model and an estimated
dollar cost, and the split between model-under-test and grader is visible separately.

## Phase 2 — Batch API for grading (50%, no quality change)

Probe grading is 10 independent, non-interactive, order-insensitive calls. The Batch API bills
at **50% of standard rates**; most batches finish within an hour (max 24h).

```js
// src/evaluate.js — grade all probes in one batch instead of N streamed calls
const batch = await client.messages.batches.create({
  requests: probes.map((p) => ({
    custom_id: p.id,
    params: { model: graderModel, max_tokens: 64000, system: [...], messages: [...] },
  })),
});
// poll batches.retrieve(batch.id) until processing_status === "ended", then batches.results()
```

**Three constraints that will bite if ignored:**

1. **Batch requests are non-streaming.** `runClaude` currently streams
   (`client.beta.messages.stream`, `src/claude.js:54`). Grading needs a separate non-streaming
   path; that's fine — grader output is structured JSON that is never displayed live.
2. **The Batch API rejects the `fallbacks` parameter.** `runClaude` sets `fallbacks` whenever the
   model is Fable 5 (`src/claude.js:67-70`, used at `--effort max`). Batching and the Fable
   refusal-fallback are mutually exclusive — either drop to Opus 4.8 for batched grading, or
   skip batching at `--effort max`. Decide explicitly; do not let it 400 at runtime.
3. **Results arrive in arbitrary order.** Key by `custom_id` (the probe id), never by position.

Keep the existing synchronous path behind a flag — batch latency (minutes to an hour) is wrong
for an interactive run. Suggested surface: `probe --batch`.

**Done when:** `--batch` grades a 10-probe run, results match the synchronous path probe-for-probe,
and the Phase 1 tally shows ~50% lower grader cost.

## Phase 3 — Fix the cache/concurrency interaction

A cache entry is readable only once the first response **begins streaming**. Parallel requests
sharing a prefix all pay full price — none can read what the others are still writing.

`PROBE_CONCURRENCY = 3` (`src/evaluate.js:92`, added in the earlier concurrency work) means the
first batch of three grader calls races: all three miss the cache and each pays a full-price
write of the shared prefix (system prompt 1,427 + source content 3,047 ≈ 4,500 tokens).
Batches 2+ read the warm cache normally.

**Bounded waste:** two extra full-price prefix reads per run, ~9k tokens ≈ $0.045. Small, but
free to fix and it compounds across pages.

**Fix:** run probe #1 alone to warm the cache, then fan out the remaining N−1 at
`PROBE_CONCURRENCY`. Roughly five lines in `runProbes`.

**Also verify caching is working at all.** With Phase 1 in place, check
`cache_read_input_tokens > 0` on probes 2–10. If it is zero, a silent invalidator is at work.

**Cache-minimum hazard worth recording:** the minimum cacheable prefix is **1024 tokens on Opus
4.8**, and `gen-probes.md` (1,369) and `probe-eval.md` (1,427) clear it only narrowly. On **Opus
4.7 the minimum is 2048** — switching the analyst model there would silently stop caching both
system prompts, with no error, just a higher bill. Assert the prefix size or pin the model.

## Phase 4 — Grader model tiering (validate before adopting)

The grader is the measurement instrument; making it cheaper is only safe if it agrees with the
current one. Sonnet 5 is **$3/$15** vs Opus 4.8's **$5/$25** — a ~40% cut on grading.
(Sonnet 5's $2/$10 introductory pricing ended 2026-08-31; do not plan against it.)

**Validation is cheap because the answers already exist.** Re-grade the 20 stored answers in
`results/*/probe-results-*.json` with a candidate grader and compare against the recorded
grades — no new model-under-test calls needed.

Agreement metrics to report: mean absolute fidelity delta, hit/miss agreement rate, and
hallucination-count correlation. Adopt only if fidelity deltas stay within a few points and the
retrieval verdict never flips.

Keep the analyst (`score`, `gen-probes`) on Opus 4.8 — those are open-ended judgment tasks where
the tiering argument is much weaker.

## Phase 5 — Effort sweep

Everything defaults to `--effort high`. Effort is the primary token lever, and lower levels are
unusually strong on current models — for grading against a fixed source with an answer key,
`medium` may be indistinguishable.

Same trick as Phase 4: re-grade stored answers at `low`/`medium`/`high` and compare. Report
tokens and agreement per level, then set the grader default from evidence rather than habit.

Note the interaction: **effort changes output/thinking tokens, not input**, so it moves the
$25/MTok side — which is where the money is.

## Acceptance criteria

- [ ] `probe` and `score` report per-model token usage and estimated cost
- [ ] `probe-results-*.json` contains a `usage` block; grader and model-under-test separated
- [ ] `--batch` produces grades matching the synchronous path, at ~50% grader cost
- [ ] Batching either drops `fallbacks` or refuses to run at `--effort max` — never 400s
- [ ] Batch results keyed by `custom_id`, verified with a deliberately shuffled response
- [ ] Cache warm-up lands: `cache_read_input_tokens > 0` on every probe after the first
- [ ] A grader-agreement report exists for at least one candidate model and one lower effort
- [ ] No change to `retrieval_hit_rate` or `avg_fidelity` on re-runs of existing probe sets,
      beyond documented LLM-judge variance

## Risks

| Risk | Mitigation |
|---|---|
| Cheaper grader silently degrades measurement quality | Adopt only on measured agreement against existing runs; keep Opus as the default |
| Batch latency surprises an interactive user | Opt-in flag; print expected wait; keep sync path default |
| Prices in the local table go stale | Annotate each with its check date; treat cost output as an estimate, labelled as such |
| Usage plumbing churns three call sites | Return `{result, usage}` from `runClaude` once, rather than threading a callback through |

## References

- Streaming + cache breakpoint: `src/claude.js:54-71`
- Fable-only fallback (Batch-incompatible): `src/claude.js:67-70`
- Grader call + source-content cache breakpoint: `src/evaluate.js:226-273`
- Web search `max_uses: 5`: `src/evaluate.js:132`
- Probe concurrency: `src/evaluate.js:92`
- Token counts in this plan: measured via `messages.count_tokens` on `claude-opus-4-8`, 2026-09-09
