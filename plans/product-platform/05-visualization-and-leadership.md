# 5 — Visualization and the leadership report

**Type:** ✨ feature · **Depends on:** plan 4

## Problem

Leadership asks: *is `docs.chain.link` any good, and is it improving?* Today the answer is a table
of numbers with no trend, no comparison, and a headline (`meanScore`) that the evidence does not
support as an effectiveness measure.

The hard part is not drawing charts. It is answering that question **without overclaiming**.

## Solution

### The honest headline

The obvious design — one big "GEO Score: 64" — is the one thing not to build. The
[correlation study](../../experiments/correlation/RESULTS.md) found structural score does not
predict answer fidelity (r = −0.073, p = .84). A single composite number would assert exactly that
disproven link.

Instead the Overview leads with **two independent measures, side by side, each with its provenance**:

```
┌─ Page quality ──────────────┐  ┌─ Measured answer fidelity ──┐
│  64 / 100      ▲ +3 (30d)   │  │  52 / 100      ▼ −4 (30d)   │
│  structural rubric, 9 dims  │  │  graded by claude-sonnet-5  │
│  142 pages audited          │  │  60 probes, web mode        │
│  how well pages are BUILT   │  │  how well engines ANSWER    │
└─────────────────────────────┘  └─────────────────────────────┘
   These measure different things. In a 10-page study, structural score did
   not predict fidelity (r = −0.07). [what this means →]
```

That footnote is a feature. It is what stops the dashboard being quoted as proof of something it did
not measure, and it is more credible to a technical leadership audience than a single confident number.

### Charts

| chart | answers | form |
|---|---|---|
| Score trend | is quality improving? | line, per-protocol segments, discontinuity markers |
| Fidelity trend | are answers improving? | line, **one series per grader**, never joined |
| Band distribution | how is the portfolio spread? | stacked bar, Poor→Exemplary |
| Dimension radar | which of the 9 dimensions are weak? | radar or grouped bar |
| Product comparison | which product is behind? | horizontal bars, sorted |
| Fix backlog by ROI | what do we do next? | bars of points-recoverable |
| Coverage | how much is even measured? | donut — audited vs known pages |

**Coverage is the most important and least obvious.** A 74 average across 12 audited pages out of
1,465 is not a portfolio health figure. Every aggregate displays its denominator; the Overview shows
coverage before it shows any average.

Charts are hand-rolled SVG behind a thin `ui/src/charts/` wrapper. Rationale: the shapes needed are
simple (line, bar, stacked bar, donut, radar), a charting library is 100KB+ against a single-file
export budget, and theme-token inheritance is easier to guarantee when we own the markup. If a
genuinely complex chart appears later, the wrapper lets one be swapped in without touching callers.

### Drill-down path

Every aggregate is clickable down to evidence, which is what makes the bird's-eye view trustworthy —
a leader can always ask "show me" and land on the actual probe answer:

```
Overview: fidelity 52 ▼
  → Products: CCIP is lowest at 41
      → CCIP pages sorted by fidelity
          → page: probes, answers, grader scores
              → one probe: prompt, model answer, answer key, what was missed
```

### The exportable report

`geo report --scope product:ccip --out report.html` produces a standalone, self-contained page for
sharing: headline measures with caveats, trends, top fixes by recoverable points, coverage, and a
methods appendix naming models, effort, grader, dates and cost.

The methods appendix is non-negotiable. A report quoting fidelity without naming the grader is
misleading by omission, given the measured ~12-point Opus/Sonnet gap.

### Publishing to a domain

`vite-plugin-singlefile` inlines JS and CSS into one HTML file with the slim index embedded and page
details fetched from sibling JSON. Output is **static** — no API, no job triggering, matching the
locked deployment decision. Deployable to any static host.

```bash
geo dashboard --export dist/     # static bundle, read-only, safe to publish
geo serve                        # local, can trigger runs
```

A test asserts the exported bundle contains **no** API base URL and **no** run-trigger code path.

## Files

| file | action |
|---|---|
| `ui/src/charts/Line.jsx` `Bar.jsx` `StackedBar.jsx` `Donut.jsx` `Radar.jsx` | new — SVG primitives |
| `ui/src/charts/theme.js` | new — token-driven palette, colour-blind safe |
| `ui/src/routes/Overview.jsx` | new — two-measure headline, coverage, trends |
| `ui/src/components/MeasureCard.jsx` | new — value + delta + provenance + caveat |
| `ui/src/components/CoverageBadge.jsx` | new — denominator, always shown |
| `ui/src/components/MethodsAppendix.jsx` | new |
| `src/report/build.js` | new — standalone report generation |
| `src/cli.js` | add `report`; `dashboard --export` |
| `ui/src/charts/*.test.jsx` | new |
| `test/report.test.js` | new |

## Acceptance criteria

- [ ] Overview shows page quality and fidelity as **two separate measures**, never one composite
- [ ] Every fidelity figure names its grader
- [ ] Every aggregate shows its denominator; coverage appears before any portfolio average
- [ ] Fidelity trends render one series per grader and never join across a grader change
- [ ] Protocol changes appear as visible discontinuity markers
- [ ] Every chart reads theme tokens and is legible in both themes
- [ ] Chart palette is colour-blind safe; no chart relies on colour alone
- [ ] Every aggregate drills down to the underlying probe answer in ≤4 clicks
- [ ] `geo report` produces a self-contained file with a methods appendix naming models, grader, dates, cost
- [ ] `geo dashboard --export` emits a static bundle containing **no** API URL and **no** trigger code (asserted in test)
- [ ] Exported bundle is under 2MB for a 200-page scope
- [ ] `npm test` and `npm --prefix ui test` pass

## Risks

| risk | mitigation |
|---|---|
| Dashboard gets quoted as proof docs are effective | Two-measure headline; caveat text next to the number, not in a footer; methods appendix in every export |
| Averages over tiny coverage look authoritative | Denominator on every aggregate; coverage shown first |
| Hand-rolled charts balloon in effort | Five simple primitives only; escape hatch to a library behind the wrapper if a complex need appears |
| Export leaks a trigger path | Explicit test asserting no API URL or trigger code in the bundle |
| Single-file export grows past practical size | Index-only embed, details fetched; size assertion in CI |

## Out of scope

Scheduled/automated runs and alerting on regressions. Natural next step once history exists, but it
needs its own plan — notification routing and alert thresholds are a product decision, not a
detail of this one.
