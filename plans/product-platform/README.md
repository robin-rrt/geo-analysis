# GEO Platform — from primitives to a product

**Created:** 2026-09-18 · **Status:** planned, not started

Turns the current five CLI primitives into one product two audiences can use: the docs team running
routine checks, and leadership asking whether `docs.chain.link` is working.

Five plans, sequenced. Each is independently implementable, testable, and useful on its own — you
can stop after any of them and have something better than today.

| # | Plan | Delivers | Depends on |
|---|---|---|---|
| 1 | [Targets & the one-command runner](01-scopes-and-runner.md) | `geo run <target>` — one command, end to end | — |
| 2 | [History & a data model that scales](02-history-and-data-model.md) | trends over time; index/detail split | 1 |
| 3 | [Local server & job execution](03-local-server-and-jobs.md) | `geo serve` — trigger runs from a browser | 1, 2 |
| 4 | [React dashboard: IA, navigation, themes](04-react-dashboard-shell.md) | the app shell, routing, pagination, dark/light | 2 (3 for live runs) |
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

## Review pass — 2026-09-21

Reviewed after drafting. Four changes, two of which cut scope:

- **`scope` → `target`.** The codebase already uses `scope` for breadth within a product
  (`curated|full|bundle`); the new concept would have collided, with `curated` meaning two different
  things. Renamed, and the watchlist prefix is `watchlist:` not `curated:`.
- **Dropped the `sitemap:<glob>` target type.** The requirement is sitemap-backed autocomplete when
  picking a single page, which the picker covers; a glob type duplicated `product:`.
- **SSE → polling.** Deletes a connection registry, heartbeats and reconnection logic for no
  user-visible loss on a single-user localhost tool.
- **Dropped the radar chart.** The only fiddly primitive, and worse than a grouped bar at comparing
  9 dimensions. Four simple SVG primitives remain.

## Skill

`compound-engineering:frontend-design` is already installed and is used for the visual layer in
plans 4 and 5 — no install needed.
