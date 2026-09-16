# Variance study results

Generated 2026-09-10T16:07:32.675Z · 3 runs per condition per page

## Total score

| Condition | Page | Runs | Mean | Spread (max-min) |
|---|---|---|--:|--:|
| A no facts | non-determinism-go | 73, 73, 72 | 72.7 | **1** |
| A no facts | vrf-migration-ts | 72, 76, 74 | 74 | **4** |
| B facts | non-determinism-go | 70, 73, 71 | 71.3 | **3** |
| B facts | vrf-migration-ts | 71, 73 | 72 | **2** |
| C facts + priority rule | non-determinism-go | 70, 71, 71 | 70.7 | **1** |
| C facts + priority rule | vrf-migration-ts | 70, 66, 70 | 68.7 | **4** |

## Per-dimension spread

Spread of each dimension's 0-10 score across runs. Lower is more reproducible.

| Dimension | A | B | C |
|---|--:|--:|--:|
| Answer-first extractability | 0.5 | 0.5 | 0 |
| Structural scannability & chunkability | 0 | 0 | 0 |
| Concrete statistics & specifics | 0 | 0.5 | 0 |
| Citations & authoritative references | 0.5 | 1 | 0 |
| Quotable canonical definitions | 0.5 | 1 | 0.5 |
| Machine-readability & metadata | 0.5 | 0 | 0.5 |
| Code completeness & agent-runnability | 1 | 1 | 0.5 |
| Query/intent coverage | 0.5 | 0.5 | 0.5 |
| Clarity, fluency & terminology consistency | 1 | 0.5 | 1 |

## P1 recommendations by condition

Question 2: does the priority rule keep retrieval/prior fixes at P1?

**A (no facts) — non-determinism-go**

- run 1: Lead the map fix with the SDK helper, not "sort keys first" · Add symptom/error-phrased headings and a troubleshooting block
- run 2: Lead the map fix with the SDK helper, not "sort keys first" · Add a symptom/error-phrased entry point
- run 3: Lead every fix with the canonical SDK API, not the generic technique · Add symptom/error-phrased headings and a troubleshooting block

**A (no facts) — vrf-migration-ts**

- run 1: Defend the `Math.random()` canonical fact against priors · Fix JSON-LD language/model and entity metadata · Resolve `_onReport` vs `_processReport` inconsistency
- run 2: Fix the JSON-LD language/entity metadata · Add symptom/question-phrased headings and a mapping FAQ
- run 3: Fix the JSON-LD language/metadata mismatch · Resolve `_processReport()` vs `_onReport()` · Add symptom/error-phrased headings and a short FAQ

**B (facts) — non-determinism-go**

- run 1: Fix the `programmingLanguage` schema mismatch · Lead the map-iteration fix with the canonical SDK helper, not "sort keys first"
- run 2: Lead the map-iteration fix with the SDK helper, not "sort keys first" · Fix JSON-LD language + entity fields
- run 3: Fix the `programmingLanguage` schema mismatch · Lead map-iteration fix with the SDK helper, not generic "sort keys"

**B (facts) — vrf-migration-ts**

- run 1: Put numbers in prose, not only in code · Fix the `programmingLanguage` schema mismatch and prune junk `about[]`
- run 2: Fix the `programmingLanguage: Rust` schema falsehood · Quantify the security and platform claims in prose
- run 3: Fix the `programmingLanguage` schema mismatch · Replace the auto-generated `about` and stopword `keywords` · Add concrete specifics to prose, especially "Chain support"

**C (facts + priority rule) — non-determinism-go**

- run 1: Lead the map-iteration guidance with the SDK helper, not "sort keys first" · Add symptom/error-phrased headings and a troubleshooting entry
- run 2: Lead the map-iteration fix with the SDK helper, name `sort.Strings` as a Don't · Add symptom-phrased headings/section for the failure signature
- run 3: Rephrase the map-iteration fix to lead with the SDK API, not "sort keys" · Add symptom/error-phrased headings and a short troubleshooting block

**C (facts + priority rule) — vrf-migration-ts**

- run 1: Add concrete numbers to prose · Add symptom/equivalence-phrased sub-headings · Make snippets runnable
- run 2: Add symptom/task-phrased headings for the migration mapping · Put concrete numbers into prose, not just code · Fix the `programmingLanguage` and `about`/`keywords` schema
- run 3: Defend the `Math.random()` advice against parametric priors · Add symptom- and question-phrased headings / a short FAQ

