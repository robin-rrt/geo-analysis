# feat: deterministic pre-checks — measure what's measurable, judge what isn't

**Type:** enhancement
**Created:** 2026-09-09
**Status:** IMPLEMENTED (commit `84a2eb2`) · **primary hypothesis DISPROVEN 2026-09-10**

> ## ⚠️ Correction — read before citing this plan as rationale
>
> This plan was written around a variance-reduction claim. **A controlled study disproved it.**
> 18 audits (3 conditions × 2 pages × 3 runs, `experiments/variance-study.mjs`) measured mean
> total-score spread of **2.5 points in every condition** — with facts, without facts, and with
> facts plus the priority rule. Facts do not measurably reduce variance.
>
> Worse for the original argument: **the ±10 swing never existed as stated.** The 81/71/75 figures
> come from `audit-old.md`, `audit.md` and `audit-probe-informed.md` — *different prompt versions
> written two months apart*, not three runs of one configuration. Same-configuration spread is
> 1–4 points. Cross-configuration drift was mistaken for run variance.
>
> The pre-checks are still worth having, on **different grounds**: they detect real defects
> deterministically (`programmingLanguage: Rust` turned out to be on 3 of 4 pages — a site-wide
> generator default) and they corrected a metadata score of 8 on a page declaring the wrong
> language. That is **defect detection and accuracy**, not reproducibility.
>
> The study also surfaced something this plan did not anticipate: facts reorder recommendation
> *priority*, pushing metadata to P1 in 6/6 runs and eliminating retrieval from P1 entirely (0/6).
> A prompt rule corrects it (retrieval back to 6/6, metadata down to 1/6). Full data in
> [experiments/results.md](../experiments/results.md).

## Overview

Compute the mechanically-verifiable parts of the GEO rubric in JavaScript and hand the auditor
**measured facts** instead of making it derive them from raw HTML. The model still scores and
still writes the report — it just stops re-deriving things a parser can settle exactly.

The payoffs, as revised by the evidence:

1. **Deterministic defect detection.** A parser finds the same JSON-LD contradiction every time;
   an LLM finds it most of the time and describes it differently on each run. ✅ *Confirmed.*
2. **More accurate scoring on fact-backed dimensions** — machine-readability dropped 8 → 6 on a
   page declaring the wrong language; concrete-specifics rose 5 → 6 where the model had
   under-counted. Movement is bidirectional, so this is correction, not anchoring. ✅ *Confirmed.*
3. ~~**Lower score variance.**~~ ❌ *Not supported — see the correction above.*

<details>
<summary>Original variance argument (retained for the record)</summary>

> `concepts-non-determinism-go` has been scored three times and produced **81, 71, and 75**. A ±10
> swing on an unchanged page is the tool's biggest credibility problem — a third party cannot act
> on a number that moves that much. Anchoring the mechanical dimensions to measured values should
> compress that spread.

The flaw: those three files are different prompt versions, not repeated runs of one configuration.
</details>

## Proof that this works

Run against the live VRF migration page, the checks catch **all three P1 JSON-LD findings** that
the auditor found in prose — including the one that started this whole thread:

```
code fence languages: {"ts":5,"solidity":1}
JSON-LD declares:     Rust
=> MISMATCH: true

keywords: 28 entries | stopwords: 3
about entries matching /^Content about /: 6 of 6
```

- **`programmingLanguage: "Rust"`** on a page whose only code fences are TypeScript and
  Solidity — a pure set comparison, no judgment required.
- **`keywords`** carrying stopwords ("from", "and", "How") — a ratio check.
- **`about`** where **6 of 6** entries match `/^Content about /` — a template-artifact signature.

A parser finds these every time. An LLM finds them most of the time, and describes them
differently on each run.

**Corpus-scale confirmation.** The teammate's crawler runs this class of check across 933 pages
and finds **356 pages leaking unrendered MDX** — `Aside` (101), `Tabs` (94), `Common` (51),
`DataStreams` (40), `Accordion` (37), with `FeedPage` on 7. The single-page finding above is the
rare tail of a corpus-wide defect. This validates the mechanical approach and sets the scope
boundary for this plan: **these checks belong at corpus scale, and that tier already exists**
(see [corpus-scale-architecture.md](corpus-scale-architecture.md)). What stays in scope here is
the subset that feeds the *LLM audit prompt* — the facts the auditor should be handed rather
than left to derive.

## Which dimensions are mechanically checkable

The rubric is 9 weighted dimensions (`prompts/geo-audit.md:114-124`). Mechanical signal is
uneven, and the plan is explicit about that rather than pretending all nine can be measured:

| # | Dimension | Wt | Mechanical signal |
|---|---|--:|---|
| 6 | Machine-readability & metadata | 12 | **Near-total** — JSON-LD presence/parse/type, canonical URL, `datePublished`/`dateModified`, OG/Twitter tags, heading semantics, the three checks above |
| 2 | Structural scannability & chunkability | 15 | **Strong** — heading hierarchy + depth jumps, section length distribution, table/list counts |
| 4 | Citations & authoritative references | 10 | **Strong** — inline link count, internal vs external ratio, presence of primary-source domains |
| 3 | Concrete statistics & specifics | 12 | **Moderate** — numeral density, units, version strings, quantified-claim count |
| 7 | Code completeness & agent-runnability | 10 | **Moderate** — fence language tags present, import statements present, identifiers used but never defined |
| 1 | Answer-first extractability | 15 | Weak — needs judgment |
| 5 | Quotable canonical definitions | 8 | Weak — needs judgment |
| 8 | Query/intent coverage | 10 | Weak — needs judgment |
| 9 | Clarity, fluency & terminology consistency | 8 | Weak — needs judgment |

Dimensions with strong-or-better signal carry **49 of 100** weight; dimension 6 alone is 12 and
is nearly fully determined. The remaining 51 stays where it belongs: with the model.

## Core design decision: facts inform, they do not score

**Do not compute scores from facts.** The rubric is qualitative — "clean semantic headings" is
not `headingDepthJumps === 0`. A formula would trade honest variance for false precision and
would be wrong in ways nobody could see.

Instead, inject a `## Measured facts` block into the audit prompt, and instruct the auditor to
**treat these as ground truth and not re-derive them**. The model still assigns every 0–10 score
and writes every recommendation.

This also fixes a subtler failure: the auditor currently reads raw JSON-LD from
`buildPageContent` and can mis-transcribe it into the report. A validator that says
`programmingLanguage: "Rust" | fences: ts, solidity | MISMATCH` cannot mis-transcribe.

## Technical approach

```
src/checks/index.js       runChecks(page) -> facts object
src/checks/metadata.js    JSON-LD parse/validate, canonical, dates, OG tags
src/checks/structure.js   heading tree, depth jumps, tables, lists, section lengths
src/checks/links.js       inline links, internal/external split, primary sources
src/checks/code.js        fence languages, imports, undefined identifiers
src/checks/specifics.js   numerals, units, version strings
test/checks.test.js       node --test, asserted against the 4 real pages in results/
```

Consumes the existing `extractPage` output — `headHtml`, `jsonLd` (raw strings), and `markdown`
are already captured (`src/extract.js:102-108`), so **no new fetching and no new dependencies**.

```js
// src/checks/metadata.js — shape of the facts, not the scores
export function checkMetadata({ headHtml, jsonLd, markdown }) {
  return {
    jsonLd: {
      blocks: jsonLd.length,
      parseErrors: [],              // blocks that failed JSON.parse — the LLM can't see this
      types: ["TechArticle", "BreadcrumbList"],
      canonical: "https://…",
      datePublished: "2026-07-23",
      dateModified: "2026-07-23",
      datesIdentical: true,         // freshness signal the reports keep flagging by hand
      programmingLanguage: "Rust",
      codeFenceLanguages: { ts: 5, solidity: 1 },
      programmingLanguageMismatch: true,
      keywordCount: 28,
      keywordStopwordCount: 3,
      aboutEntries: 6,
      aboutTemplateArtifacts: 6,    // matched /^Content about /
    },
  };
}
```

Every field is a **measurement**, never a verdict — no `score`, no `grade`, no `severity`.

### Prompt integration

Add one section to `buildPageContent` output and one paragraph to `prompts/geo-audit.md`:

> `## Measured facts` — These were computed deterministically from the served page. Treat them
> as ground truth. Do not recount, re-derive, or contradict them; use them as evidence when
> scoring the dimensions they bear on. They are measurements, not scores — you still assign
> every score yourself.

**Prompt-cache note:** the facts block is page-specific and volatile, so it must sit **after**
the cached system prompt, never inside it. Injecting it into `buildPageContent` (the user
message) does this correctly by construction.

## Verification: does it actually reduce variance?

This is the claim worth testing, and it is testable with the artifacts already on disk.

**Protocol:** pick two pages. Run `score` 3× on each with facts off, and 3× with facts on
(6 runs per page, 12 total). Report per-condition:

- spread of the total score (max − min)
- spread of each mechanical dimension's 0–10 score, especially #6
- output + thinking tokens per run (needs the usage instrumentation from
  [cost-and-instrumentation.md](cost-and-instrumentation.md) Phase 1)

**Success:** total-score spread narrows, and dimension 6's spread narrows most. **Honest failure
mode to report rather than bury:** if spread does not narrow, the variance is coming from the
qualitative dimensions and this work bought only tokens — say so plainly and stop at that.

12 audit runs is the real cost of this plan; at roughly $0.30 per audit that is a few dollars.
Land the usage tally first so the token half of the result is measured, not estimated.

## Implementation phases

### Phase 1 — Metadata checks (highest value, fully mechanical)
`src/checks/metadata.js` + tests. Ship the three proven checks first (language mismatch,
stopword keywords, template `about` artifacts) plus JSON-LD parse validation, canonical, and
date checks.
**Done when:** all four `results/` pages produce facts, and the VRF page reports
`programmingLanguageMismatch: true`.

### Phase 2 — Structure, links, code, specifics
The remaining modules. Each is independently useful and independently testable.
**Done when:** `runChecks` returns a complete facts object for all four pages, with tests
asserting known values (e.g. VRF fences = `{ts: 5, solidity: 1}`).

### Phase 3 — Prompt integration
Wire facts into `buildPageContent`, add the ground-truth paragraph to the audit prompt, keep the
block after the cache breakpoint.
**Done when:** a `score` run visibly cites the measured facts in its metadata analysis.

### Phase 4 — Variance study ✅ RAN 2026-09-10 — hypothesis not supported

Executed as `experiments/variance-study.mjs`: 3 conditions × 2 pages × 3 runs = 18 audits.
Mean total-score spread was **2.5 in every condition**. The pre-registered diagnostic failed —
judgment-only dimensions (which receive no facts) moved as much as fact-backed ones, so the
per-dimension differences are run noise. Results: [experiments/results.md](../experiments/results.md).

Secondary finding, now validated and shipped: facts reorder recommendation priority, and a prompt
rule corrects it (metadata at P1 6/6 → 1/6; retrieval 0/6 → 6/6).

## Acceptance criteria

- [ ] `runChecks(page)` returns facts for all four pages in `results/`, no new dependencies
- [ ] Facts contain measurements only — no score, grade, or severity field
- [ ] VRF page: `programmingLanguageMismatch: true`, `aboutTemplateArtifacts: 6`, keyword
      stopwords ≥ 1
- [ ] JSON-LD that fails `JSON.parse` is reported as `parseErrors`, not silently skipped
- [ ] Facts block sits after the cached prefix; `cache_read_input_tokens` unchanged on repeat runs
- [ ] Tests assert known values from the real pages, and fail loudly if extraction changes
- [x] Variance study completed — result was **negative**; recorded above and in experiments/results.md

## Risks

| Risk | Mitigation |
|---|---|
| Facts anchor the model into *lower* scores (framing effect) | **Measured: did not occur in scores** — movement was bidirectional (metadata 8→6, specifics 5→6). It *did* occur in recommendation priority; corrected by a prompt rule. |
| A wrong fact is now authoritative and un-second-guessed | Tests assert against real pages; `parseErrors` surfaces rather than swallows failures |
| Check modules drift as pages change | Fixtures are live pages, so tests fail when extraction breaks — that is the intent |
| Scope creep into scoring formulas | The no-verdict-fields rule is an acceptance criterion, not a convention |

## References

- Rubric and weights: `prompts/geo-audit.md:114-124`
- Extraction output consumed by checks: `src/extract.js:102-108`
- Prompt assembly point for the facts block: `src/extract.js:114-134` (`buildPageContent`)
- The three P1 JSON-LD findings this automates: `results/reference-vrf-migration-ts/audit.md:40-44`
- Variance claim (disproven): `experiments/results.md`; the 81/71/75 files are different prompt versions, not repeated runs
- Proof-point measurements in this plan: run live against the VRF page, 2026-09-09
