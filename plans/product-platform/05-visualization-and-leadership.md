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
| Band distribution | how is the portfolio spread? | bar, Poor→Exemplary |
| Dimension breakdown | which of the 9 dimensions are weak? | grouped horizontal bar |
| Product comparison | which product is behind? | horizontal bars, sorted |
| Fix backlog by ROI | what do we do next? | bars of points-recoverable |
| Coverage | how much is even measured? | bar + explicit `n/N` label — a two-part ratio does not need a donut |

**Coverage is the most important and least obvious.** A 74 average across 12 audited pages out of
1,465 is not a portfolio health figure. Every aggregate displays its denominator; the Overview shows
coverage before it shows any average.

Charts are hand-rolled SVG — **two** primitives, `Line` and `Bar`, which cover all seven charts
above. Radar was dropped (fiddly, and worse than a sorted bar at comparing 9 magnitudes); donut and
stacked bar followed (a donut is a worse bar for a two-part ratio, and stacked bar had one caller).

No wrapper abstraction. An earlier draft justified one by "a library could be swapped in later" —
that is a dependency we do not have, abstracted in advance. Two SVG components with a props
interface are the abstraction.

**Already computed, do not recompute:** [rollup.js:222](../../src/product/rollup.js#L222) already
emits `potentialFixes` ranked by recoverable points, and a per-check breakdown. The "fix backlog by
ROI" and "dimension breakdown" charts are views over existing data.

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

**Folded into the export, not a second exporter.** An earlier draft specified both
`geo-audit report` and `geo-audit dashboard --export`, two overlapping paths producing
self-contained HTML. There is one: `geo-audit dashboard --export dist/ [--target <t>]`, where
`--target` filters to a single product for sharing.

The methods appendix is non-negotiable. A report quoting fidelity without naming the grader is
misleading by omission, given the measured ~12-point Opus/Sonnet gap.

### Publishing to a domain

`vite-plugin-singlefile` inlines JS and CSS into one HTML file with the slim index embedded and page
details fetched from sibling JSON. Output is **static** — no API, no job triggering, matching the
locked deployment decision. Deployable to any static host.

```bash
geo-audit dashboard --export dist/     # static bundle, read-only, safe to publish
geo-audit serve                        # local, can trigger runs
```

A test asserts the exported bundle contains **no** API base URL and **no** run-trigger code path.

## Files

| file | action |
|---|---|
| `ui/src/charts/Line.jsx` `Bar.jsx` | new — the only two SVG primitives |
| `ui/src/charts/theme.js` | new — token-driven palette, colour-blind safe |
| `ui/src/routes/Overview.jsx` | new — two-measure headline, coverage, trends |
| `ui/src/components/MeasureCard.jsx` | new — value + delta + provenance + caveat |
| `ui/src/components/CoverageBadge.jsx` | new — denominator, always shown |
| `ui/src/components/MethodsAppendix.jsx` | new |
| `src/cli.js` | `dashboard --export [--target]` — one exporter |
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
- [ ] Every aggregate drills down to its underlying evidence in ≤4 clicks — to the probe answer where probes exist, and to the audit finding for audit-only targets (a `--stages audit` run has no probes, so an unqualified probe-answer criterion would be unsatisfiable)
- [ ] The export carries a methods appendix naming models, effort, grader, dates and cost
- [ ] The export is built from a **separate Vite entry point** with the API client swapped for the static implementation at build time, so "no trigger code" is structural rather than a grep over minified output; the test asserts the API entry module is absent from the bundle graph
- [ ] Exported **HTML file** is under 2MB for a 200-page target; sibling page-detail JSON is excluded from that figure and fetched on demand
- [ ] `npm test` and `npm --prefix ui test` pass

## Risks

| risk | mitigation |
|---|---|
| Dashboard gets quoted as proof docs are effective | Two-measure headline; caveat text next to the number, not in a footer; methods appendix in every export |
| Averages over tiny coverage look authoritative | Denominator on every aggregate; coverage shown first |
| Hand-rolled charts balloon in effort | Two primitives only; if a genuinely complex chart appears, add a library then — not before |
| Export leaks a trigger path | Separate build entry point; the API client is not in the static bundle's module graph |
| Single-file export grows past practical size | Index-only embed, details fetched; size assertion in CI |

## Out of scope

Scheduled/automated runs and alerting on regressions. Natural next step once history exists, but it
needs its own plan — notification routing and alert thresholds are a product decision, not a
detail of this one.
