# Status — what's done, what's left

**Updated:** 2026-09-16 · everything below is on `main`, 79 tests passing.

This is the index. Each plan file carries its own detail; this says which parts of it are real.

## Shipped

| Area | State | Commit |
|---|---|---|
| **Dashboard** — self-contained HTML over `results/` | ✅ done | `d5f3a83` |
| **Deterministic pre-checks** — rubric facts fed to the auditor | ✅ done | `84a2eb2` |
| **Priority rule + decimal parser + `--no-facts`** | ✅ done | `826aaca` |
| **Deterministic retrieval + slim, blinded grader** (multi-model PR1) | ✅ done | `46ea668` |
| **Probe-set identity, resume, probe × model matrix** (multi-model PR2) | ✅ done | `3e82ee0` |
| **Usage + cost instrumentation** — every command reports spend | ✅ done | `b3671c9`, `d3bd811` |
| **Product scope** — resolve / fetch / rollup / ledger, zero LLM cost | ✅ Phases 1–2 | `5acee5c` |

## Left to do, in the order I'd tackle it

### 1. Product audit + probes — `plans/product-scoped-audit-and-probes.md` Phases 3–5
The biggest remaining piece, and the one the product work was building toward.

- **Phase 3 — product audit.** One LLM call over the T0 aggregate plus outliers, *not* one call
  per page. Needs `prompts/product-audit.md`. Auditing 725 CCIP pages individually would cost
  ~$127 at the measured $0.1748/audit; this should cost roughly one audit.
- **Phase 4 — product probes.** Generate probes from product context via
  `src/product/context.js` (built, untested against a live run). Two things to get right:
  - **Cache TTL.** Probes take ~60–75s each; 10 sequential runs blow past the 5-minute default
    and silently re-pay full price. Use the 1-hour TTL or enough concurrency to finish inside
    the window. Verify with `cache_read_input_tokens` — the instrumentation now reports it.
  - **Tiered retrieval.** Extend `src/retrieval.js` from boolean to
    `exact` / `in-scope` / `out-of-scope` / `none`. Layer onto the existing matcher; do not
    rewrite it. Keep `exact` reported so old runs stay comparable, and label the headline change
    a *correction*, not an improvement.
- **Phase 5 — dashboard product view.**

### 2. Batch API for grading — `plans/cost-and-instrumentation.md` Phase 2
50% off grading, now unblocked (`evaluate.js` is stable post-merge). Three traps documented in
the plan: batch requests are non-streaming, **the Batch API rejects the `fallbacks` parameter**
that `claude.js` sets at `--effort max`, and results return in arbitrary order so they must be
keyed by `custom_id`.

### 3. Cheap wins in the same plan
- **Phase 3** — cache warm-up. `PROBE_CONCURRENCY = 3` means the first three grader calls race
  and all miss the cache. Run probe #1 alone, then fan out. ~5 lines.
- **Phase 4/5** — grader model tiering and an effort sweep. Both validate for free by re-grading
  the 20 stored answers rather than making new model-under-test calls.

### 4. Multi-model PR3 — provider seam + OpenAI
`plans/multi-model-probe-matrix.md`. Deliberately deferred: PR1+PR2 delivered the cost and
correctness wins. Do it when someone actually needs a non-Claude number. Cost already returns
`null` rather than a wrong figure for an unpriced model, so the seam won't silently understate.

### 5. Correlation study — not in any plan, and I'd rank it above PR3
Does structural score predict answer fidelity? CRE scores 88.6 structurally while its pages
answer at 55–62 fidelity. If they don't correlate, several plans are optimising a number that
doesn't matter. ~8 probe runs on the `dynamic-content-visibility` pages; the addresses page is
already independently scored 37/100.

### Blocked
- **`plans/corpus-scale-architecture.md`** — needs access to the teammate's crawler JSON. Its
  conclusion (*consume T0, don't rebuild it*) still stands, so leaving it unstarted costs nothing.

## Corrections carried in the plans

Two claims were disproven by measurement. Both are annotated in place; don't re-inherit them:

- **Pre-checks do not reduce score variance.** An 18-audit study measured 2.5-point spread in
  every condition. The 81/71/75 that motivated the plan came from three *different prompt
  versions* two months apart, not three runs of one configuration.
  See `experiments/results.md`.
- **"The recorded hit rates stand"** (multi-model plan) is false. The deterministic matcher
  correctly flips `non-determinism-go/p02` from miss to hit, moving that page 20% → 30%.
  `collect.js` surfaces this as `hitCorrections`; only the plan text is stale.

## Known measurements worth not re-deriving

- One `score` audit: **$0.1748** (not the ~$0.30 previously estimated).
- One 10-probe closed-mode run: **$0.4919** — model-under-test $0.2110, grader $0.2809.
- Grader prompt caching verified working: 40,320 cache-read vs 11,876 fresh tokens.
- `docs.chain.link`: 1,465 sitemap URLs, growing ~70/week. CCIP bundle ~1.16M tokens — over the
  1M context window, so bundle-or-selection is a requirement.
- A single `score` run has a 0% cache hit rate by construction: one audit is one call.
