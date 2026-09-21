# GEO Platform — from primitives to a product

**Created:** 2026-09-18 · **Status:** ✅ all five plans implemented (2026-09-21)

Turns the current five CLI primitives into one product two audiences can use: the docs team running
routine checks, and leadership asking whether `docs.chain.link` is working.

Five plans, sequenced. Each is independently implementable, testable, and useful on its own — you
can stop after any of them and have something better than today.

| # | Plan | Delivers | Depends on |
|---|---|---|---|
| 1 | [Targets & the one-command runner](01-scopes-and-runner.md) | `geo-audit run <target>` — one command, end to end | — |
| 2 | [History & a data model that scales](02-history-and-data-model.md) | trends over time; index/detail split | 1 |
| 3 | [Local server & job execution](03-local-server-and-jobs.md) | `geo-audit serve` — trigger runs from a browser | 1, 2 |
| 4 | [React dashboard: IA, navigation, themes](04-react-dashboard-shell.md) | the app shell, routing, pagination, dark/light | 2, 3 |
| 5 | [Visualization & the leadership report](05-visualization-and-leadership.md) | charts, bird's-eye view, static export to a domain | 4 |

## Decisions locked with you

| Decision | Choice |
|---|---|
| Deployment | **Split** — public dashboard is read-only; triggering runs is local/internal only |
| Stack | **React + Vite**, plus a single-file static export for publishing |
| History | **Full history + trends** |
| Coverage | **Per-product and curated watchlists**, sharing one *target* abstraction |

## The constraint that shapes this product

The dashboard today headlines `meanScore` — the structural GEO score
([src/dashboard/collect.js:274](../../src/dashboard/collect.js#L274)).

On 2026-09-18 a pre-registered study
([experiments/correlation/RESULTS.md](../../experiments/correlation/RESULTS.md)) found that
**structural score does not predict answer fidelity** (causal estimand r = −0.073, p = .84, n=10).

Leadership will read a big "GEO Score: 64" as "our docs work". That is precisely the inference the
evidence does not support. So, as a hard product rule across plans 4 and 5:

- **Structural score** is labelled *page quality* — how well a page is built. Never *effectiveness*.
- **Fidelity** is the measured outcome — how well engines actually answer. Shown separately, always
  with its grader, because Sonnet grades ~12 points harsher than Opus and the scales must not mix.
- The two are **never combined into one headline number**, and the UI never implies one predicts
  the other.
- Every retrieval figure carries the correction found in the same study: `any-citation` overcounts
  retrieval, because a model printing a URL from memory (`via=null`) is counted as a citation.

This is not decoration. A dashboard that overstates what was measured is worse than no dashboard,
because it gets quoted in a deck. The honest framing is also the more useful one: *"here is what we
can prove, here is what we can't yet"* is a better answer to leadership than a false certainty.

## Requirement traceability

Every requirement from the brief, mapped to where it is satisfied.

| Requirement | Plan |
|---|---|
| One script/command that runs it and gets the outputs | 1 |
| Pick a product **or** a page, page discovered from sitemap | 1 (resolver), 3 (`/api/targets`), 4 (picker autocomplete) |
| Granular: just audit, just gen-probes, just test probes | 1 (stages), 3 (API), 4 (stage picker) |
| Run full e2e from the UI | 3, 4 |
| Dashboard runs on a domain | 5 (static export), 3 (local serve for runs) |
| React or minimal and light | 4 |
| Navigation improved | 4 |
| Graphs, bars, charts, visual indicators | 5 |
| Pagination and UI/UX best practices | 4 |
| Dark and light modes | 4 |
| Team: routine checks | 1 (`watchlist:` target), 2 (history/drift) |
| Leadership: bird's-eye with drill-down | 5 |
| UI refactor acceptable | 4 (replaces `src/dashboard/render.js`) |

## Cost guardrails — a UI requirement, not a nicety

Measured: **$0.17** per page audit, **~$2.50** per 6-probe web run, **$24.80** for the 10-unit
study. A full-site sweep of 1,465 pages is **~$250 in audits alone**, far more with probes.

A button that can spend that must not be one click. Plan 1 specifies a cost preflight; plan 3 makes
the API refuse to start a run without an acknowledged estimate; plan 4 puts the dollar figure in the
confirm dialog. Cheap to build now, expensive to retrofit after someone's first surprise bill.

## Review history

### Self-review — 2026-09-21
`scope` → `target` (collided with the existing product-breadth `scope`); dropped a `sitemap:<glob>`
target type; SSE → polling; dropped the radar chart; collapsed three storage projections to two.

### Agent review — 2026-09-21
Three reviewers (DHH, Kieran, simplicity). Every code-level claim below was independently verified
before being accepted.

**Factual correction — plan 2 was wrong about its own premise.** It blamed the 272KB dashboard file
on embedded audit prose. Measured: prose is **14.7%**; probe runs are 41.8%; and `primaryRun` is
**byte-identical** to `probeRuns[0]` — 97.2KB, 41.8% of the file, pure duplication from
[collect.js:211](../../src/dashboard/collect.js#L211). Deleting one line halves the file today.
The index/detail split was also unachievable as specified, because it stripped prose while leaving
~50KB of probe payload per page in the index.

**Data-integrity bug the plans would have shipped.**
[`slugFromUrl`](../../src/probes.js#L148) keys on the last two path segments, so
`/ccip/getting-started/evm` and `/vrf/getting-started/evm` both become `getting-started-evm`.
Verified by running it. In a flat page namespace that silently overwrites one product's page with
another's.

**Wrong completion predicate.** `graded_count > 0` marks a page done when 1 of 6 probes graded, and
`graded === probe_count` ignores legitimate refusals. Corrected to
`graded + refusals + errors === probe_count` with errors retryable.

**Substantial reuse missed.** `mixedGraders` ([collect.js:268](../../src/dashboard/collect.js#L268)),
ROI-ranked `potentialFixes` ([rollup.js:222](../../src/product/rollup.js#L222)), a 21-token theme
set, `bar()`/`kpi()`/`table()`, `changedSince`/`writeLedger`, and `cmdProduct` as the existing
pipeline — all previously written as new work. `matrix.js` had no home in any plan and would have
been silently orphaned along with the probe-matrix CSV.

**Unverifiable criteria removed or made measurable:** "type error" in a repo with no TypeScript
(now a runtime throw); "without jank" (now interaction-to-paint <100ms); "byte-for-byte rebuild"
(impossible — [resolve.js:144](../../src/product/resolve.js#L144) stamps a timestamp; now semantic
equality); "no trigger code" (now a separate build entry point rather than grepping minified
output).

**Cut:** the `acknowledgedCost` handshake, the migration module (six legacy dirs — re-run them), the
Settings route, two of four chart primitives, the chart wrapper abstraction, and `src/report/build.js`
as a second exporter.

**Rejected, with reasons.** Two recommendations conflicted with stated requirements the reviewers
did not have:

- *"Delete plan 3, a docs team has a terminal."* The brief explicitly asks to run the whole process
  from the UI.
- *"Delete watchlists, the requirement is product-or-page."* The curated set was explicitly
  requested as the team's quick routine check.

**Newly added from review:** run-health fingerprinting (`search_degraded_count` /
`live_search_failed_count` already exist and make fidelity inconclusive); a run status enum with
cancelled/partial excluded from trends; atomic writes and locking for the shared projection; a cap
on concurrent *runs* rather than only pages; and stage input hashing so a page edited mid-run is
not scored against stale text.

## Skill

`compound-engineering:frontend-design` is already installed and is used for the visual layer in
plans 4 and 5 — no install needed.
