# feat: corpus-scale architecture — consume T0, own the fidelity layer

**Type:** architecture
**Created:** 2026-09-09 · **Revised:** 2026-09-09 after seeing the teammate's dashboard
**Status:** planned

## Overview

Scale `geo-audit` from "one page you name" to the whole docs site. The revised conclusion, after
seeing the crawler's actual output: **do not rebuild the deterministic tier — consume it.** The
teammate's tool already does corpus-scale structural checking well, with better scoring machinery
than this plan originally proposed. `geo-audit`'s unique asset is the layer no crawler can reach:
whether a model actually *answers correctly* from a page.

## Correction: my earlier sampling was reproducible but wrong

The first draft of this plan claimed **"33% of `.md` URLs 404"** from a deterministic 40-page
sample (every 35th sitemap URL). The crawler measures the full corpus and reports
**97.1% availability (906/933)**.

My number was badly skewed, and the reason matters. Systematic sampling (`NR%35==1`) over a
*sorted* URL list lands in contiguous blocks — mine fell heavily into `ccip/directory/*`, the
auto-generated token and chain pages, which are exactly the ones without markdown twins. The
sample was perfectly reproducible and perfectly unrepresentative.

**The lesson I drew was too weak.** I wrote "make sampling deterministic," taking the afdocs
note at face value. The stronger lesson their crawler demonstrates: **when the tier is free,
don't sample at all — crawl everything.** Determinism fixes reproducibility; only full coverage
fixes representativeness. Any sampling in this tool from here on needs a stated justification,
not just a seed.

The one finding of mine that survived: `<FeedPage />` leaking into
`data-feeds/price-feeds/addresses.md`. Their corpus view shows it on **7 pages**, and as a minor
instance of a much larger pattern — **356 pages leak unrendered MDX**, led by `Aside` (101),
`Tabs` (94), `Common` (51), `DataStreams` (40), `Accordion` (37). Single-page auditing found the
rarest tail of the problem.

## What the crawler already measures

Overall **74.9/100** across **933 scored pages** (the sitemap's 1,394 entries include
non-page items — `llms-full.txt`, `search-index`, `README` — which they exclude). Fern-equivalent
**92.0**, reported alongside but deliberately not folded in.

| Check | Result | Sev |
|---|---|---|
| `dynamic-content-visibility` | 8/8 data pages hide their data from the markdown variant | fail |
| `md-parity` | 174/904 pages (19.2%) drop >15% of HTML sentences from markdown | fail |
| `component-leakage` | 356 pages leak unrendered MDX | fail |
| `llms-txt-coverage` | 74% of 933 URLs reachable via 21 nested index/bundle files; only **10.1% linked directly**; 85 llms.txt links absent from the sitemap | fail |
| `md-availability` | 906/933 (97.1%); 99% counting doc pages only | fail |
| `internal-link-integrity` | 33/5944 (0.6%) unresolved; **649 outside the crawled corpus, not scored** | fail |
| `code-fence-validity` | 1 unclosed fence; 258/5917 fences untagged | fail |
| `token-cost` | median **1,415**, p95 **6,246**, max **136,605** tokens | warn |
| `html-boilerplate-ratio` | median page ships **53× more HTML than markdown** | warn |
| `tab-variant-coverage` | 15/45 tabbed pages drop ≥1 tab (147/270 labels missing) | warn |
| `heading-structure` | 31/906 markdown bodies have a heading problem | warn |
| `cache-headers` | **0/906 (0%)** carry ETag or Last-Modified | warn |
| `llms-full-txt` | root `llms-full.txt` missing though `llms.txt` points at it | warn |
| `afdocs-external` | 13/23 checks pass, overall 92 | weight 0 |

### Three of their design choices are better than what I planned

1. **Points-recoverable ranking.** The Details tab ranks fixes by **score points recoverable** —
   `dynamic-content-visibility` 8.9, `md-parity` 4.1, `component-leakage` 3.9,
   `llms-txt-coverage` 3.1, `cache-headers` 2.0 — and the points sum to exactly the 25.1-point
   gap between 74.9 and 100. That is an ROI-ordered backlog derived from the score itself.
   Our P1/P2/P3 tiers are a human's qualitative guess by comparison. **Adopt this.**
2. **Score by area, not by page.** Product sections are the unit a docs team can act on and own.
   Quickstarts **44.0** (23 pages), CRE Templates **49.0** (22), Any API **49.9** (11) versus
   Data Link **88.7**, CRE **88.6** (188), CCIP **85.3** (263). A per-page list of 933 rows is
   not actionable; twenty area rows are.
3. **Fix text written for the reader who must act.** *"Render address tables, network lists and
   directory data into the markdown variant. An agent that reads only `.md` currently sees a
   component tag or an empty section where the data should be."* Cause, consequence, and remedy
   in two sentences.

Plus the honesty patterns already noted: per-check denominators (`649 point outside the crawled
corpus and are not scored`), documented heuristic weakness (`Substring heuristic: read the trend,
not the absolute number`), and weight-0 external reporting.

## The strategic conclusion: stop planning to rebuild T0

The original plan had `geo-audit` building its own crawl + deterministic tier. Against what
exists, that is duplicated work at lower quality. Revised split:

| Tier | Owner | Status |
|---|---|---|
| **T0** Crawl + structural checks, 933 pages | **Teammate's crawler** | Built |
| **T1** Triage — which pages deserve expensive treatment | `geo-audit` | To build (small) |
| **T2** LLM audit (`score`) | `geo-audit` | Built |
| **T3** Probe + grade — answer fidelity | `geo-audit` | Built |

**T1 is nearly free now.** Their area scores *are* the triage signal: Quickstarts (44.0),
CRE Templates (49.0), and Any API (49.9) are where probe budget belongs. The open question from
the first draft — "how do we rank pages without traffic data?" — is answered by consuming their
per-area and per-page findings.

### What only `geo-audit` can measure

Their score answers *"is this page well-formed for agents?"* It cannot answer *"will an agent
answer correctly from it?"* Our probe data on two pages they score well:

| Page | Their structural view | Our fidelity | Retrieval |
|---|---|--:|--:|
| `workflow-using-randomness` | CRE area — 88.6 | **62.3** | 30% |
| `concepts-non-determinism-go` | CRE area — 88.6 | **55.6** | 20% |

CRE is their **third-strongest** area at 88.6 across 188 pages. Both pages we probed inside it
answer at 55–62 fidelity, and a model recommended Chainlink VRF for in-workflow randomness —
the wrong product entirely. Structural health and answer health are not the same variable, and
right now nobody is measuring the second one at scale.

### The novel artifact: join the two

With 933 structurally-scored pages and fidelity measurements on a selected subset, one question
becomes answerable that neither tool can address alone:

> **Does structural quality actually predict answer quality?**

Probe a stratified sample — some pages from Quickstarts (44.0), some from CRE (88.6) — and
correlate structural score against fidelity. Both outcomes are valuable:

- **If they correlate**, the crawler's 74.9 is validated as a proxy for answer quality, its
  points-recoverable ranking becomes a *predicted fidelity gain*, and the cheap tier can stand
  in for the expensive one across the whole corpus.
- **If they don't**, that is the more important result: it means the structural checks measure
  something real but insufficient, and fidelity probing is not optional — it's the only
  instrument pointed at the outcome anyone actually cares about.

`dynamic-content-visibility` is the sharpest test available. It carries the single largest fix
value (8.9 points) and has an obvious causal story — a page whose data is invisible to `.md`
*should* produce wrong answers. `data-feeds/price-feeds/addresses` is one of its 8 pages and we
already scored it **37/100** independently. Probe those 8 pages first: if fidelity is not
catastrophic on all 8, the causal story is wrong and that is worth knowing early.

## Integration approach

Consume the crawler's output rather than re-deriving it:

1. **Ingest its JSON** — per-page findings, area scores, points-recoverable — into `geo-audit`
   as T0 facts. Their `afdocs-external` wrapper is the precedent for how to hold an external
   signal: **weight 0, reported, never scored**, until we have reason to trust it in our own number.
2. **T1 triage** reads T0 facts + area scores and emits a ranked page list as an auditable artifact.
3. **T2/T3** run on that list via the Batch API (see
   [cost-and-instrumentation.md](cost-and-instrumentation.md)).
4. **The dashboard gains a corpus view** that shows structural score and fidelity side by side —
   the join above is the headline, not two separate numbers on separate pages.

### Two hard constraints their data exposes

- **`cache-headers` is 0/906.** No `.md` response carries an ETag or `Last-Modified`. The
  incremental-crawl design in the first draft assumed cheap revalidation; it is not available.
  Incrementality must run on **content hashing after a full refetch**, which saves LLM cost (the
  expensive part) but not HTTP. Their 2.0-point fix recommendation would change this — worth
  advocating for, but do not design against it landing.
- **`token-cost` max is 136,605 tokens.** Our `score` command sends the whole page. At Opus 4.8
  input rates that single page costs ~$0.68 in input alone before any thinking, and it consumes
  meaningful context. T2 needs a size guard: skip, chunk, or flag pages above a threshold.
  The median (1,415) and p95 (6,246) are comfortable — this is strictly a tail problem, and the
  tail is where an unguarded pipeline breaks.

## Phases

1. **Ingest crawler output** — parse its JSON into T0 facts; reconcile denominators (their 933
   scored vs the sitemap's 1,394 entries) and record the reconciliation explicitly.
   *Done when:* `geo-audit` can list every page with its area, structural score, and findings.
2. **T1 triage** — deterministic ranking from T0 facts + area score; emit the ranked list.
   *Done when:* a reproducible ranked list exists and two runs on unchanged input match exactly.
3. **Correlation study** — probe the 8 `dynamic-content-visibility` pages plus a stratified
   sample across strong and weak areas; report structural-vs-fidelity correlation.
   *Done when:* the question above is answered with numbers, in either direction.
4. **Batched T2/T3 over the triaged set**, with the token-cost size guard.
5. **Dashboard corpus view** — structural and fidelity joined, points-recoverable adopted for
   our own recommendations.

## On subagents (unchanged by the new data)

Still mostly the wrong tool. T2/T3 are N independent, fully-specified jobs with structured
output — a single-call workload served by a bounded work pool plus the Batch API, not by an
orchestrator spawning one agent per page (which re-establishes context per page and adds failure
modes for no capability gain).

The new data does sharpen where agents *do* fit. **Remediation is now concretely scoped:** 356
pages leaking MDX, led by `Aside` (101) and `Tabs` (94) — their own fix note observes that
"fixing the top component by page count clears the most pages for the least work." That is
multi-step work across many files with verification, i.e. Claude Code / Agent SDK territory, and
a separate tool from this one. **Corpus synthesis** over T0 findings remains the other fit. Both
consume T0 output; neither is on the critical path.

## Acceptance criteria

- [ ] No re-implementation of T0 checks the crawler already performs
- [ ] Crawler output ingested; denominator reconciliation (933 vs 1,394) documented
- [ ] External structural score enters at **weight 0** until validated against fidelity
- [ ] T1 emits a reproducible ranked list; identical across runs on unchanged input
- [ ] Correlation study completed on the 8 `dynamic-content-visibility` pages + stratified sample,
      and its result reported whichever way it lands
- [ ] T2 guards against the token-cost tail (max 136,605) rather than sending any page blindly
- [ ] Incrementality uses content hashing, not ETag (0/906 available)
- [ ] Points-recoverable ranking adopted for our recommendations
- [ ] No subagent-per-page orchestration

## Open questions

- **Is the crawler's JSON output stable and consumable?** Everything here assumes a machine-readable
  artifact behind the dashboard. If it only emits HTML, ingestion needs its own small plan.
- **Who owns the joined score?** If structural and fidelity correlate, one blended number may be
  right. If they don't, keep them separate and say why — do not average two things that measure
  different variables.
- **Does the crawler cover the Vercel preview host?** Our audits ran against a preview branch; its
  933 pages are `docs.chain.link`. Comparisons need the same host or an explicit canonical mapping.

## References

- Teammate's dashboard: Summary and Details tabs, `docs.chain.link`, 2026-09-08 — score 74.9,
  933 pages, fern-equivalent 92.0 (screenshots)
- Their check docs: `code-fence` (weight 2), `heading-structure` (weight 1), `afdocs-external`
  (weight 0); rollup `(passingPages + 0.5 × warnPages) / evaluatedPages`
- External spec: agentdocsspec.com — 23 checks, 7 categories
- Fidelity evidence: `results/workflow-using-randomness/`, `results/concepts-non-determinism-go/`
- Companion plans: [deterministic-prechecks.md](deterministic-prechecks.md),
  [cost-and-instrumentation.md](cost-and-instrumentation.md)
