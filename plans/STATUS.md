# Status — what's done, what's left

**Updated:** 2026-09-21 · `main` plus the platform work on `feat/target-runner`
([PR #1](https://github.com/robin-rrt/geo-analysis/pull/1)). 184 Node + 14 UI tests passing.

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
| **Markdown-endpoint fix** — HTML checks skip `.md` pages | ✅ done | `70ff566` |
| **Product audit** — one LLM call over the rollup | ✅ Phase 3 | `6e890e8` |
| **Tiered retrieval** — exact / in-scope / out-of-scope / none | ✅ done | `fe393f9` |
| **Product probes** — product-scoped generation + tiered scoring | ✅ Phase 4 | `808754d` |
| **Dashboard Products view** | ✅ Phase 5 | `d176edd` |
| **Batch grading** — `probe --batch` | ✅ built; cache bug fixed, live run pending | `3debfe8`, `60b0fda` |
| **Cheaper defaults** — Sonnet grader, medium probe effort | ✅ done | — |
| **Batch saving confirmed** — and a 2× over-reporting bug fixed | ✅ done | `d1d33c1` |
| **Correlation study** — pre-registered, n=10, $24.80 | ✅ done, **null** | `5307598` |

### Platform — [plans/product-platform/](product-platform/), on `feat/target-runner`

| Area | State | Commit |
|---|---|---|
| **`run <target>`** — one command, stages, resume, cost preflight | ✅ done | `2f8be49` |
| **Immutable run snapshots + trends + index/detail split** | ✅ done | `4093ade` |
| **`serve`** — local job server, polled progress, loopback-only | ✅ done | `9307e25` |
| **React dashboard + charts + read-only static export** | ✅ done | `4f760c8` |

## Worth knowing before building on this

- **Fidelity does not follow structural score.** The correlation study settled it: r = −0.07,
  p = .84 on the causal estimand. The platform therefore never combines the two into one number.
  n=10 excludes only |r| > 0.64, so this is *not shown*, not *shown absent*.
- **`any-citation` overcounts retrieval.** A model printing a URL from memory (`via=null`) is
  counted as a citation. Use searches-per-probe as the retrieval measure.
- **`slugFromUrl` collides across products** (`slice(-2)`); the store keys on the full path
  instead. Anything new writing to a shared page namespace must use `src/store/slug.js`.
- **Runs are immutable now.** Nothing should write into a previous run directory.

## Left to do, in the order I'd tackle it

### 0. Populate the dashboard with real data
The platform works but `results/` holds a single page audit, so the Overview trend view is
empty and the leadership case is unmade. A `product:vrf` audit-only run is **~$2.27** and would
give it something real; full stages over a product is **~$50**. Needs a spend decision, not
engineering.

### 0b. The intervention study — better evidence than more correlation
Apply the tool's own P1 fixes to 8–10 pages and re-probe the same pages with the same probe sets.
Same-page before/after removes topic difficulty, parametric familiarity and the baseline ceiling
in one step — the three confounds that limited the correlational design — and it tests what the
tool claims to do rather than whether its score ranks pages.

### 1. Product audit + probes — `plans/product-scoped-audit-and-probes.md` Phases 3–5
The biggest remaining piece, and the one the product work was building toward.

- ~~**Phase 3 — product audit.**~~ ✅ **Done 2026-09-17** (`6e890e8`). `product <name> --audit`
  costs **$0.1474** for a 13-page product vs $2.27 auditing the pages individually — 15x. Ranked
  the scope gap P1 over higher-scoring checks, i.e. retrieval over measurability.
- ~~**Phase 4 — product probes.**~~ ✅ **Done 2026-09-17** (`808754d`). `product <name> --probes`
  generates from the whole product; the output is a normal probes.json so `probe` runs it
  unchanged. Cache TTL handled: contexts over 60k chars request a 1-hour entry. Verified on a
  live run — 831,663 grader cache-read tokens against 23,047 fresh.
  - ~~**Tiered retrieval.**~~ ✅ **Built and measured 2026-09-17** (`retrievalTier`). Against the
    existing 20 probes it changes nothing — `in-scope` is 0/20, so strict and tiered rates are both
    30%. Retrieval failure is *total*: 14 of 20 answers cite nothing at all. Kept because it is
    correct and will matter when a product probe's answer key spans pages, but the
    "corrects an understatement" claim is retracted.
- ~~**Phase 5 — dashboard product view.**~~ ✅ **Done 2026-09-17** (`d176edd`).

### 2. Batch grading — built, root cause fixed, one live confirmation outstanding
`probe --batch` is implemented (`3debfe8`). The first live run errored on all ten requests; the
cause was a cache_control TTL ordering violation, fixed in `60b0fda` and verified synchronously.
**Closed out.** A 10-probe batch then completed with all ten graded (vrf curated, closed mode,
avg fidelity 68.5).

Confirming the saving exposed a second bug: `costOf` priced batched tokens at standard rates, so
batched runs were reported at **twice** what they actually cost. The API returns
`service_tier: "batch"` in usage; `addUsage` was dropping it. Now carried through and halved at
costing time. That first batch reported a $1.0724 grader cost; the real figure is **$0.5362**.

The lesson from the `scopeUrls` no-op applies here too — a field that exists is not a field that
arrives. The propagation is pinned by a test that drives a real batch-entry shape through
`parseJsonEntry` → `addUsage` → `costOf`, not by the presence of the assignment.

Debugging lesson worth keeping: the Batch API's round trip makes each attempt cost ten minutes.
Firing the same params at the **synchronous** endpoint runs identical validation and errors
instantly. Do that first for any batch shape problem.

### 3. Cheap wins in the same plan
- **Phase 3** — cache warm-up. `PROBE_CONCURRENCY = 3` means the first three grader calls race
  and all miss the cache. Run probe #1 alone, then fan out. ~5 lines.
- ~~**Phase 4 — grader model tiering.**~~ ✅ Done, and **measured**: the grader now defaults to
  Sonnet 5 and the model under test to `--probe-effort medium`. See the grader-bias correction
  below before comparing any new fidelity number against an old one.
- **Phase 5 — effort sweep** still open; validates for free by re-grading stored answers.

### 4. Multi-model PR3 — provider seam + OpenAI
`plans/multi-model-probe-matrix.md`. Deliberately deferred: PR1+PR2 delivered the cost and
correctness wins. Do it when someone actually needs a non-Claude number. Cost already returns
`null` rather than a wrong figure for an unpriced model, so the seam won't silently understate.

### 5. ~~Correlation study~~ ✅ Done — 2026-09-18. **Answer: no detectable relationship.**

Full write-up: [experiments/correlation/RESULTS.md](../experiments/correlation/RESULTS.md).
Pre-registered before any probe ran; n=10 pages (scores 41–77), 6 probes each, web and closed arms
on the same probes, single grader, 20 runs all succeeded, zero attrition. **$24.80.**

| test | r | p |
|---|--:|--:|
| score → web fidelity | 0.231 | .52 |
| score → closed fidelity (confound check) | 0.134 | .71 |
| score → **lift** (causal estimand) | **−0.073** | .84 |
| score → citation rate | −0.122 | .74 |

**The r = 0.98 preview that used to sit here was an artefact of n=4 and a mixed scale.** With ten
comparable units on one instrument and one grader it vanishes. Worth remembering as a case where a
near-perfect small-n correlation meant nothing.

What *is* established, and it is the useful part: **web access is worth +9.7 fidelity points**
(Wilcoxon p = .001 over 60 paired probes). Retrieval helps; structural score does not predict who
benefits from it.

Honest limit: n=10 only excludes |r| > 0.64. This is "not shown", not "shown absent". Do not
quote it as proof structure is irrelevant.

Two things fell out of it:
- **`any-citation` overcounts retrieval** — a unit with 0 searches still logged a citation, because
  the model printed a URL from memory (`via=null`). Use searches-per-probe as the retrieval measure.
- A `lift`-based design has a strong built-in ceiling artefact: baseline → lift is r = −0.78. Any
  future analysis of lift must partial out the baseline.

**Next, and better than more correlation:** an intervention study. Apply the tool's own P1 fixes to
8–10 pages and re-probe the same pages with the same probe sets. Same-page before/after removes
topic difficulty, parametric familiarity, and the ceiling in one step, and it tests what the tool
claims to do rather than whether its score ranks pages.

### Blocked
- **`plans/corpus-scale-architecture.md`** — needs access to the teammate's crawler JSON. Its
  conclusion (*consume T0, don't rebuild it*) still stands, so leaving it unstarted costs nothing.

## Corrections carried in the plans

Three claims were disproven by measurement. All are annotated in place; don't re-inherit them:

- **Pre-checks do not reduce score variance.** An 18-audit study measured 2.5-point spread in
  every condition. The 81/71/75 that motivated the plan came from three *different prompt
  versions* two months apart, not three runs of one configuration.
  See `experiments/results.md`.
- **"The recorded hit rates stand"** (multi-model plan) is false. The deterministic matcher
  correctly flips `non-determinism-go/p02` from miss to hit, moving that page 20% → 30%.
  `collect.js` surfaces this as `hitCorrections`; only the plan text is stale.
- **Tiered retrieval does not raise hit rates.** `in-scope` is 0/20 on the page probe sets and
  0/10 on the first product run. Retrieval failure is *total* — answers cite nothing at all
  rather than citing a sibling page. The tiering is kept; the "corrects an understatement"
  rationale is retracted.

## ⚠️ Fidelity is grader-relative

The grader default moved from Opus 4.8 to Sonnet 5 for cost. Re-grading the 20 stored answers with
both: **mean absolute delta 12.6 points, mean signed delta −12.1** — Sonnet grades systematically
harsher, and only 8 of 20 land within 10 points.

The bias is systematic rather than random, and **ranking is preserved** (83→60, 75→58, 65→48,
40→25, 33→8 keep their order), so Sonnet is a usable instrument at a shifted scale. But:

- **Do not compare a Sonnet-graded fidelity against an Opus-graded one.** Every figure recorded
  before this change is on the old scale.
- Every run records `grader_model`; the dashboard warns when a corpus mixes graders.
- Re-grade rather than mix if a like-for-like comparison is needed.

## Open question worth chasing

The first product run scored **77.2 avg fidelity at 0% retrieval** — 8 of 10 answers cited
nothing, 2 cited outside the product, none cited a VRF page. The model answers VRF questions
well from parametric memory and never opens the docs. If that holds up, "improve the docs so
engines retrieve them" may be the wrong frame for a product this well-known, and the
**correlation study** (below) becomes the most important open item rather than a nice-to-have.

Caveat before anyone acts on it: the product probes are not the same questions as the page
probes (77.2 vs 55–62 fidelity is not a like-for-like comparison), and this is one run of one
product.

## Known measurements worth not re-deriving

- One `score` audit: **$0.1748** (not the ~$0.30 previously estimated).
- One 10-probe closed-mode run: **$0.4919** — model-under-test $0.2110, grader $0.2809.
- Grader prompt caching verified working: 40,320 cache-read vs 11,876 fresh tokens.
- `docs.chain.link`: 1,465 sitemap URLs, growing ~70/week. CCIP bundle ~1.16M tokens — over the
  1M context window, so bundle-or-selection is a requirement.
- A single `score` run has a 0% cache hit rate by construction: one audit is one call.
- One **product probe** run (10 probes, VRF, web mode): **$4.17** — model-under-test $2.77
  (411k input tokens, mostly web-search results), grader $1.40.
- Product probe generation over a 13-page context: **$0.62**.
- One **product** audit over a 13-page rollup: **$0.1474** — vs $2.27 for the pages individually.
- VRF curated scores **88.1** (was 74.8 before HTML checks stopped firing on `.md` endpoints).
- Curated `llms.txt` indexes link **`.md` endpoints exclusively** (13/13 for VRF), which have no
  HTML metadata layer at all.
