# Does structural GEO score predict answer fidelity?

**No — not detectably, in this corpus.** All four pre-registered tests are null. But n=10 can only
rule out a *strong* relationship (|r| > 0.64); a moderate one is not excluded.

One thing the study does establish conclusively: **web access is worth +9.7 fidelity points**
(p = .001, 60 paired probes). What it cannot show is that a page's structural score predicts who
gets that benefit.

Design and analysis were fixed in [PREREGISTRATION.md](PREREGISTRATION.md) before any probe ran.
Raw output: [analysis-output.txt](analysis-output.txt) · [results.json](results.json)

## What was run

10 documentation pages, structural scores **41–77**, ≤2 per product section. Each page got 6
probes, answered twice on the **same** probes — once with web search, once closed — so each unit is
its own control. `lift = web − closed`.

| constant | value |
|---|---|
| model under test | `claude-opus-4-8`, `--probe-effort medium` (tool default) |
| grader | `claude-sonnet-5`, single grader throughout |
| runs | 20, **all succeeded**, batch-graded |
| paired probes | 60, **zero attrition** — every probe graded in both arms |

Cost: **$24.80** ($18.24 measured on probe runs, $6.56 estimated for audits and probe generation).

## Results

| unit | score | web | closed | lift | cite |
|---|---:|---:|---:|---:|---:|
| data-streams-api | 41 | 51.2 | 39.8 | +11.3 | 0.50 |
| fund-your-contract | 56 | 46.0 | 57.8 | −11.8 | 0.00 |
| dta-actors | 58 | 42.7 | 21.0 | +21.7 | 0.17 |
| automation-service-limits | 61 | 63.2 | 37.2 | +26.0 | 0.67 |
| chainlink-functions | 63 | 65.5 | 70.7 | −5.2 | 0.50 |
| datalink | 64 | 36.8 | 17.2 | +19.7 | 0.00 |
| cre-evm-client | 64 | 46.5 | 30.7 | +15.8 | 0.50 |
| ace | 67 | 35.7 | 22.0 | +13.7 | 0.17 |
| conceptual-overview | 73 | 63.3 | 63.8 | −0.5 | 0.17 |
| link-token-contracts | 77 | 66.7 | 60.2 | +6.5 | 0.33 |

### Pre-registered tests — all null

| # | test | Spearman r | 95% CI | p |
|---|---|---:|---|---:|
| H1 | score → web fidelity (naive) | 0.231 | [−0.63, 0.84] | .52 |
| H2 | score → **closed** fidelity (confound check) | 0.134 | [−0.62, 0.67] | .71 |
| H3 | score → **lift** (causal estimand) | **−0.073** | [−0.80, 0.59] | .84 |
| H4 | score → any-citation rate (mediator) | −0.122 | [−0.74, 0.60] | .74 |

Smallest |r| detectable at n=10, α=.05: **0.636**. The nulls rule out a strong relationship and
nothing weaker. OLS slope for H1 is 0.36 fidelity points per structural point, CI [−0.46, 1.23] —
i.e. a 30-point structural improvement buys somewhere between −14 and +37 fidelity points.

H2 being flat is the one piece of good news for the instrument: had closed-mode fidelity tracked
structural score, the naive H1 correlation would have been confounded by topic familiarity, since
page structure cannot affect what the model already memorised. It doesn't, so H1's null is a real
null rather than a cancelled confound.

### What is established: retrieval helps

Pairing at the **probe** level (n=60, not 10) gives the study its only well-powered test:

- mean lift **+9.7 points**, SD 20.6
- Wilcoxon signed-rank **p = .001**

Web access improves answers. Which pages benefit is not predicted by their structural score.

### Exploratory — suggestive, not established

Searching more correlated with larger lift: r = 0.695, p = .031, slope +5.6 points per additional
search per probe. **This does not survive scrutiny as causal evidence:**

- `lift` is bounded by its own baseline, and baseline → lift is **r = −0.78 (p = .011)** — a strong
  ceiling artefact. A unit already answered well has no room to gain.
- The model searches less when it already knows the topic (baseline → searches r = −0.53).
- Holding baseline fixed, searches → lift drops to **partial r = 0.530**, which n=10 cannot
  distinguish from zero.

It also sits among 11 post-hoc tests; at p = .031 it would not survive correction for that many.
Treat it as a hypothesis for a pre-registered follow-up, not a finding.

Per-dimension correlations against lift were all null (|r| ≤ 0.42, min p = .22). With 9 dimensions
at n=10 there was a 37% chance of a spurious hit; none appeared.

## Measurement caveat found mid-study

**`any-citation` overcounts retrieval.** One unit recorded 0 web searches yet a 0.17 citation rate:
the model printed `remix.ethereum.org` from memory, with `via=null`. Citation counts include URLs
the model emitted without retrieving anything, so H4's mediator is biased upward. `searches per
probe` is the cleaner measure.

## What this does and does not say

**Does:** the GEO score, as currently constructed, is not a validated predictor of answer fidelity.
It should not be presented as one. The rubric measures structural properties; whether those
properties change LLM answers is unestablished.

**Does not:** this is not evidence that structure is irrelevant. n=10 excludes only |r| > 0.64. A
moderate real effect would have been missed more often than not.

Scope: one corpus (Chainlink docs), one model under test, one grader, page-level units, a single
point in time. The score range sampled was 41–77; nothing here speaks to pages below 41 or above 77.

## What would settle it

The correlational design is near its limit — reliability analysis before the study showed units buy
power and probes do not, and n is budget-bound at roughly $2.50 per unit for the web arm.

An **intervention** study would be decisively better and cheaper per unit of evidence: take 8–10
pages, apply the tool's own P1 fixes, re-probe the same pages with the same probe sets, and test
whether lift moves. Same-page before/after removes topic difficulty, parametric familiarity, and the
baseline ceiling in one step — the three confounds that dominate this design. It also tests what the
tool actually claims to do, which is improve pages, rather than whether its score happens to rank them.
