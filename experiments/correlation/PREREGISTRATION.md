# Pre-registration — does structural GEO score predict answer fidelity?

**Written:** 2026-09-18, before any probe was run. Unit list fixed by
[select-units.mjs](select-units.mjs) (seeded). Analysis code written before outcomes were seen.

## The question

The tool scores a page's structure out of 100. The implicit promise is that a better-structured
page produces better LLM answers. That has never been tested.

## Why a raw correlation would not answer it

Two confounds make `corr(score, fidelity)` close to meaningless on its own:

1. **Probes are generated from the page.** Each page gets its own bespoke probes, graded against
   an answer key derived from that page. Fidelity therefore carries the difficulty of that page's
   topic, which is a property of content, not structure.
2. **Retrieval mostly fails.** In existing runs only 2–4 probes in 10 cite anything at all. When
   the page is never retrieved, the model answers from parametric memory — which page structure
   *cannot* causally affect at inference time. A raw correlation would largely measure how well
   Claude already knows each topic.

Confound 2 is the serious one: it predicts a positive correlation with no causal path, because
well-known products plausibly have both better docs and more training presence.

## Design

Each unit is measured twice **on the same probes**, differing only in retrieval access:

| arm | model access | what it measures |
|---|---|---|
| `closed` | no web | parametric baseline — structure cannot affect this |
| `web` | web search | parametric + whatever retrieval adds |

**`lift = web − closed`** is the retrieval-attributable component, with each unit acting as its
own control. Topic difficulty and parametric familiarity cancel in the difference.

## Hypotheses and pre-committed interpretation

| # | Test | Prediction if structure matters | If it fails |
|---|---|---|---|
| H1 | Spearman(score, web fidelity) | positive | — |
| H2 | Spearman(score, **closed** fidelity) | **≈ 0** | a positive H2 means H1 is confounded, not causal |
| H3 | Spearman(score, **lift**) | positive | the causal estimand; a null here is the real answer |
| H4 | Spearman(score, any-citation rate) | positive | tests the mediator: structure → retrieval |

**Committed in advance:**

- H3 is the causal test. H1 alone will **not** be reported as "structure predicts fidelity".
- If H2 is comparable to H1, I report the raw correlation as confounded.
- If citation rates are near-zero across all units (H4), then the mediating path is absent and H3
  is **untestable in this corpus**. That will be reported as untestable, *not* as evidence of no
  effect. Absence of a path is not absence of an effect.

## Power — stated before seeing results

n ≈ 10 units. Spearman needs |r| ≳ 0.65 for p < .05 two-tailed at n=10. Bootstrap 95% CIs will be
reported for every coefficient.

Measured from existing runs: per-probe fidelity SD = 22.4, implied single-probe ICC = 0.29. A
6-probe mean has reliability 0.71, so a true r of 0.6 attenuates to ≈0.51 observed. Going to 10
probes only reaches 0.54 — **units buy power, probes do not**, which is why the budget goes to
breadth.

**A null result at this n cannot distinguish "no relationship" from "moderate relationship."**
That limit is acknowledged up front and will not be written around afterwards.

## Sampling and the estimand

18 pages audited, ≤2 per section (pages within a product share a template, so they are not
independent). ~10 then selected **stratified across the observed score range**.

Selection is on the predictor, never on fidelity. Consequence, stated now: stratifying on X
**inflates Spearman r** but leaves the **regression slope unbiased**. The slope (fidelity points
per structural point) is therefore the primary effect size; r is secondary and carries this caveat.

## Protocol constants

Identical across every unit — old runs are *not* reused, because they predate `--probe-effort` and
their tested-model effort is unrecorded.

- model under test: `claude-opus-4-8`, `--probe-effort medium` (the tool's default)
- grader: `claude-sonnet-5` (single grader; Opus- and Sonnet-graded fidelity are ~12 points apart
  and must never be mixed)
- 6 probes per unit · web and closed arms on the same probe set · `--batch` grading

## Stopping rule

One pass. No adding units after seeing coefficients, no dropping units except for a
pre-stated technical failure (probe generation refuses, or a run errors), which will be reported
with the reason.
