# feat: multi-model probe matrix — deterministic retrieval, provider seam, probe × model table

**Type:** enhancement
**Created:** 2026-09-10 · **Revised:** 2026-09-10 after plan review (DHH, Kieran, simplicity)
**Status:** planned
**Companion plans:** [cost-and-instrumentation.md](cost-and-instrumentation.md) (batch, cache warm-up,
grader tiering, effort) · [corpus-scale-architecture.md](corpus-scale-architecture.md) (multi-page runs)

## Overview

The ask has four parts:

1. Make probe generation and testing scalable and token-efficient.
2. Give each page a table of probes × the models they were tested against.
3. Show that table in the dashboard, so it is clear which models a page's fidelity number comes
   from and how models compare.
4. Keep the design open to non-Claude models.

The plan is three PRs, each shippable on its own:

| PR | Delivers | Size |
|---|---|---|
| **1. Deterministic retrieval + slim grader** | Code decides the retrieval hit and computes fidelity, not the grader. The grader is blinded to model identity and emits fewer tokens | ~1 day |
| **2. Probe-set identity + resume + matrix CSV** | Probes are tied to the content they came from, unchanged pages are never regenerated, runs skip answered probes, and each page gets `probe-matrix.csv` | ~1 day |
| **3. Provider seam + OpenAI + matrix tab** | `-m claude-opus-4-8,openai:gpt-5.5` in one command, and a probe × model matrix in the dashboard with model badges everywhere | ~2 days |

After PR 3, **stop and probe the 4 existing pages with 2 models.** More providers, a leaderboard,
and variance runs wait until that data asks for them (see **Deferred**).

## Problem statement

| Today | Consequence |
|---|---|
| The model-under-test path calls the Anthropic SDK directly (`src/evaluate.js:121-201`) | No non-Claude model can be probed, though the README names ChatGPT, Perplexity, and Gemini as the engines GEO targets |
| The dashboard shows only `primaryRun = probeRuns[0]` (`src/dashboard/collect.js:124`), the newest run, and every aggregate is built on it (`collect.js:129-201`) | With two models, the page's fidelity figure, hit rate, funnel, and archetype table silently become "whichever ran last." The UI names the model in exactly one KPI tile (`src/dashboard/render.js:302`) |
| A run file carries no link to the probe set it answered | Regenerating `probes.json` makes old results *look* comparable when they aren't |
| Each `probe` run re-asks every probe; `gen-probes` always regenerates | Adding a model, or recovering from a crash at probe 7 of 10, pays for everything again |
| The grader decides the retrieval hit and echoes the cited-URL list back | A string-match decision made by an LLM, and paid as output at $25/MTok |
| The grader computes `fidelity = round(2.5 × Σ scores)` | Verified identical on 20/20 stored grades, so the model is spending output tokens on arithmetic |
| The grader prompt names the model under test (`src/evaluate.js:248`) | Once non-Claude models are graded by Claude, that's an invitation to self-preference bias |

### Evidence from current `results/` (computed 2026-09-10)

- **Retrieval matching.** Strict URL matching agrees with the grader's `hit_expected_source` on
  19 of 20 probes. The one disagreement is `workflow-using-randomness` p10. Its answer names
  `` `docs.chain.link/cre/guides/workflow/using-randomness` `` in backticks **without a scheme**.
  `bodyUrls` (`src/evaluate.js:101`) matches only `https?://`, so it missed the mention; the
  grader correctly counted it as a hit, and its `notes` say so.
  **The bug is in our extractor, not the grader.** The deterministic matcher in PR 1 must match
  scheme-less mentions of the expected URL, and p10 is a regression test asserting a **hit**.
  The recorded hit rates stand: 30% and 20%.
- **Fidelity is pure arithmetic.** `fidelity == round(2.5 × Σ scores)` on 20/20 stored grades.
- **Hash inputs need care.** Both `probes.json` files contain a model-invented
  `generated_at: "2025-01-15T00:00:00Z"`, so an ID that hashed `generated_at` would be
  meaningless. `src/extract.js` currently has uncommitted edits, and any hash over extractor
  output changes when the extractor does.

## Design

### Decision 1: retrieval is deterministic; the grader judges content only

`src/retrieval.js` holds the pieces pulled out of `src/evaluate.js`:

```js
// src/retrieval.js
/** host (lowercased, no www.) + path (no trailing slash, no .md twin); query/fragment dropped. */
export function normalizeUrl(u) { /* ... */ }

/** Explicit links in the answer body (moved from evaluate.js:99). */
export function bodyUrls(text) { /* ... */ }

/**
 * A retrieval hit is either a cited URL that normalizes to an expected one, OR a scheme-less
 * mention of an expected host+path in the answer text (e.g. `docs.chain.link/cre/...` in
 * backticks, the p10 case). Returns why, so the dashboard can show it.
 */
export function retrievalHit({ citedUrls, answer, expectedUrls }) {
  // -> { hit: boolean, via: "citation" | "mention" | null }
}
```

- **The harness writes the `retrieval` object, not the grader:**
  `retrieval: { cited_urls, hit_expected_source, via, notes }`. The result-row shape the rest of
  the tool reads is unchanged, so `score --probe-results` (`prompts/geo-audit.md:61-73`) and the
  dashboard keep working without a new payload format.
- **One line in `prompts/geo-audit.md` changes.** Step 2 currently says "Trust
  `hit_expected_source` and its `notes` (graders read the answer body) over `cited_urls`." It
  becomes: "`hit_expected_source` is computed by the harness from citations and in-text mentions
  of the source URL."
- **The grader's `EVAL_SCHEMA` drops `retrieval`, `probe_id`, `model_tested`, and `fidelity`.**
  The harness already overwrites the first two (`src/evaluate.js:274-275`), and the last two are
  now code. Remaining grader output: `scores`, `hallucinations`, `missing_must_include`,
  `unverifiable_from_source`, `verdict`, plus an optional `retrieval_note` for the case "the
  answer says search failed".
- **`prompts/probe-eval.md` changes to match:**
  - Remove the `MODEL:` line; the grader is blinded.
  - Remove "echo the cited URLs verbatim."
  - Remove the fidelity formula and the retrieval-check paragraph.
  - Keep the rubric text word-for-word so scores stay comparable with stored grades.
- **Closed mode:** `hit_expected_source` is `null`, not `false`. Closed-mode runs have no
  retrieval to miss, and the collector already renders `null` as `—`.
- **Refusals:** grading the `"(model refused to answer)"` placeholder is wasted spend. Record
  `stop: "refusal"`, skip the grade, and render the cell as `refused`.

### Decision 2: probes are tied to the content they were generated from

Two fields are added to `probes.json`:

| Field | Computed as | Excludes |
|---|---|---|
| `source_hash` | `sha256(source_content)`, first 12 hex chars | — |
| `probe_set_id` | `sha256(JSON.stringify(probes.map(p => [p.id, p.prompt, p.answer_key])))`, first 12 hex chars (canonical: fixed field order, no whitespace) | `generated_at` and every other model-invented metadata |

- `gen-probes` skips regeneration when the freshly extracted page's `source_hash` equals the
  existing file's, printing `unchanged — use --force to regenerate`.
- **Extractor edits are a known trigger.** Any change to `src/extract.js` output changes every
  `source_hash`, so every page regenerates on its next `gen-probes`. That is correct: the answer
  keys were derived from the old extraction. The behavior is documented, and no extractor
  version goes into the hash.
- **Existing `probes.json` files get the two fields computed in place** by a one-off
  `scripts/backfill-probe-ids.mjs`, committed once and then deleted. `probes-old.json` is left
  alone; it is already excluded by the `-old` glob.

### Decision 3: keep one run file per (model, mode) and add resume

This follows the simplicity and DHH reviews. The existing layout, one
`probe-results-<model>-<mode>.json` per model, already *is* the per-model store, and
`collect.js:104-108` already reads every run file on a page. No JSONL, no answers/grades split,
no new store module.

- **The run summary gains:**
  - `probe_set_id`
  - `provider`
  - `model_tested` as a full spec (`openai:gpt-5.5`; legacy bare `claude-*` normalized to
    `anthropic:claude-*` on read)
  - `grader_prompt_sha`, which is `sha256(probe-eval.md + JSON.stringify(EVAL_SCHEMA))`, first
    12 hex chars
- **File naming:** `probe-results-<fileKey>-<mode>.json`.
  - For Anthropic, `fileKey` is the model without its `claude-` prefix, as today, so both
    existing files keep their names.
  - For other providers it is `<provider>-<model>`, with `/` and `:` replaced by `-`. For
    example, `probe-results-openai-gpt-5.5-web.json`.
- **Resume:** if the output file exists with the same `probe_set_id`, `mode`, and
  `grader_prompt_sha`, `probe` keeps every result whose `stop` is not `"error"` and runs only
  the missing or errored probes. `--force` re-runs everything. A mismatched `probe_set_id` means
  the probe set changed and the run starts fresh, with the old file overwritten after a warning.
  A mismatched `grader_prompt_sha` also starts fresh; mixing grader versions in one run is
  exactly the comparability bug the resume rule exists to prevent.
- **Crash-safe writes:** the file is rewritten after each completed batch as write-to-`.tmp` then
  `rename` (atomic on POSIX). A crash loses at most the in-flight batch, never the file.
- **Single writer per file:** one `probe` process owns one run file. Different models write
  different files, so running them in parallel is safe. Two concurrent `probe` processes on the
  **same** page, model, and mode are unsupported; README says so. No lockfile until someone
  actually needs one.
- **Legacy files:** the collector recomputes `hit_expected_source` for legacy rows with the new
  `retrieval.js`, using the grader-echoed `retrieval.cited_urls` together with mentions in the
  stored `answer` text, and tags them `via: "recomputed"`. The harness-seen `citedUrls` were never
  persisted, and the echo was prompted as verbatim, so it is the best source available. Expected
  result: identical to the stored values (19 by strict match, plus p10 by mention).

### Decision 4: one provider seam, two providers

```js
// src/providers.js — split into a directory when a third provider arrives, not before
export const PROVIDERS = {
  anthropic: { ask: anthropicAsk, env: "ANTHROPIC_API_KEY", search: "tool" },
  openai:    { ask: openaiAsk,    env: "OPENAI_API_KEY",    search: "tool" },
};

/** "openai:gpt-5.5" -> {provider:"openai", model:"gpt-5.5"}; splits on the FIRST ":" only.
 *  Bare "claude-*" -> anthropic (every existing command line keeps working). */
export function parseModelSpec(spec) { /* ... */ }

/** @returns {{answer, citedUrls, search:{attempted, succeeded, errors, degraded},
 *             usage:{input_tokens, output_tokens, cache_read_input_tokens, searches}, stop, retries}} */
async function openaiAsk({ prompt, model, mode }) { /* fetch https://api.openai.com/v1/responses */ }
```

- **`anthropicAsk`** is `executeProbeOnce` + `executeProbe` (`src/evaluate.js:121-221`) moved
  verbatim: the `pause_turn` loop, the search-error retry, and the web-search version switch.
  No behavior change. The existing probe tests and a re-run of one page confirm parity.
- **`openaiAsk`** is plain `fetch` to the Responses API with `tools: [{ type: "web_search" }]`
  in web mode, and no new dependency. Fields it reads:

  | Output | Source in the response |
  |---|---|
  | answer | concatenated `output_text` from `message` output items |
  | `citedUrls` | `annotations[]` where `type === "url_citation"` → `.url`, plus `bodyUrls(answer)` |
  | `search.attempted` | count of `web_search_call` output items |
  | `search.succeeded` | count of those with `status === "completed"` |
  | `usage` | `usage.input_tokens`, `output_tokens`, `input_tokens_details.cached_tokens` |

- **Unknown shapes fail loudly.** If a web-mode response contains no recognizable citation
  structure, the adapter throws. An empty list would silently score as a retrieval miss.
- **Capability gating:** `--mode web` with a provider whose `search` is not `"tool"` fails before
  any API call. A missing API key fails at the first call for that provider with the env var
  name.
- **Usage is recorded on every answer.** Grader usage comes from an optional
  `onUsage(usage)` callback added to `runClaude` (`src/claude.js:37`). It is non-breaking:
  `score` and `gen-probes` don't pass it, and its return value is unchanged. The run summary
  gains a `usage` block split into model-under-test and grader, which covers cost-plan Phase 1
  for the probe path.
- **Multiple models in one command:** `-m a,b` runs the models concurrently, one
  `Promise.all` entry each. Each keeps the existing batch loop of 3 concurrent probes with 8 s
  web pacing (`src/evaluate.js:82-92`) and writes its own file. Providers have separate rate
  limits, so parallelism across them is free.

### Decision 5: which number is the page's fidelity

Fidelity is reported against a **headline run**, defined in `collect.js` with no config:

1. the newest run of `anthropic:claude-opus-4-8` in `web` mode on the current `probe_set_id`
   (`DEFAULT_PROBE_TARGET`, `src/cli.js:19`, which makes the corpus figures comparable
   across pages);
2. otherwise, the newest `web` run on the current `probe_set_id`;
3. otherwise, none. The page shows `—`.

Every fidelity figure in the UI carries a **model badge**, for example
`62.3 · opus-4-8 · web`. The corpus aggregates that `primaryRun` feeds today (`hitRate`,
`funnel`, `byArchetype`, `fidelityByRetrieval`, `medianFidelity`, `collect.js:129-201`) switch
to `headlineRun`. The Answer-quality view states which model the corpus figures come from. All
`primaryRun` call sites in `render.js` are renamed and audited in the same PR.

**Stale runs are shown, not compared.** A run whose `probe_set_id` differs from the page's
current `probes.json` is excluded from the headline and from the matrix averages. It appears
greyed out with the label "answered an older probe set."

## The per-page table

### `results/<slug>/probe-matrix.csv`

It is written after every `probe` run, and by `dashboard` for every page. One row per probe;
per model-and-mode column: fidelity, hit, and high-severity hallucination count.

```csv
probe_id,archetype,prompt,anthropic:claude-opus-4-8|web fidelity,anthropic:claude-opus-4-8|web hit,anthropic:claude-opus-4-8|web high_sev,openai:gpt-5.5|web fidelity,...
p01,direct-howto,"How do I generate randomness in a CRE workflow so all nodes agree on the result?",70,1,1,58,0,0,...
```

- The column key `provider:model|mode` is called `runKey` in code, not "model".
- Fields follow RFC 4180 quoting, because prompts contain commas and quotes.
- `hit` is `1`/`0`/empty, where empty means closed mode or refused.
- The pivot logic is a pure function, `pivotRuns(runs, probeSet)`, in
  `src/dashboard/matrix.js`. The dashboard and the CSV both use it, and it can be tested without
  touching the filesystem.

### Dashboard: the Probes tab becomes the matrix

```
Probe set a41be07c · 10 probes · graded by opus-4-8 (high) · web            columns: opus-4-8 ✓  gpt-5.5 ✓

 ID   Archetype      Prompt                          opus-4-8   gpt-5.5   spread
 p01  direct-howto   How do I generate randomness…    70 ●       58 ○       12
 p02  code-first     Show me code to…                 36 ○       31 ○        5   ← both fail: page problem
 p03  constrained    Using the Go SDK, how do I…      81 ●       79 ●        2
 …
 avg fidelity (n answered/10)                         62.3 (10)  55.1 (10)
 hit rate                                             30%        40%
 high-sev hallucinations                              9          6
                    ● source cited · ◐ source mentioned in text · ○ missed · ▲ inconclusive · refused
```

- **Column header** shows the provider, model, mode, run date, `n answered/N`, and grader.
  Averages are over answered probes, and the `n` is shown beside each.
- **Spread column** (max − min fidelity across columns) is the diagnostic. A probe every model
  fails points at the page or its retrieval; a probe one model fails points at the model. The
  table sorts by spread and by row mean.
- **Clicking a cell** opens the existing per-probe card (`render.js:262-296`) for that model.
- **Single run:** with exactly one run, the tab renders as today plus the badge. Nothing
  regresses for the 4 current pages.

**Overview:** the corpus-table fidelity cell gains the model badge, and a **Models** column
lists a chip for each model run on the current probe set.

**Methodology:** the probe-runs table gains the provider, the probe set id (with "stale" when it
no longer matches), and the grader prompt sha.

## Files

```
src/retrieval.js               NEW  normalizeUrl, bodyUrls (moved), retrievalHit
src/providers.js               NEW  PROVIDERS, parseModelSpec, anthropicAsk (moved), openaiAsk
src/dashboard/matrix.js        NEW  pivotRuns (pure), toCsv
src/evaluate.js                     orchestration: resume, harness-written retrieval, code fidelity,
                                    skip grading refusals, per-model Promise.all, usage block
src/probes.js                       source_hash, probe_set_id, hash-skip
src/claude.js                       optional onUsage callback (return value unchanged)
src/cli.js                          -m a,b; --force on gen-probes and probe; file naming via fileKey;
                                    write probe-matrix.csv
prompts/probe-eval.md               blinded; no retrieval/echo/fidelity instructions
prompts/geo-audit.md                step 2 wording: hit is harness-computed
src/dashboard/collect.js            spec normalization, legacy hit recompute, headlineRun, stale runs
src/dashboard/render.js             matrix tab, badges, Models column, methodology columns
scripts/backfill-probe-ids.mjs      one-off; run, commit results, delete
test/retrieval.test.js         NEW
test/providers.test.js         NEW  against test/fixtures/openai-web-response.json (recorded once)
test/matrix.test.js            NEW
README.md                           model spec syntax, OPENAI_API_KEY, resume/--force, CSV
```

## Implementation phases

### PR 1: deterministic retrieval and a slimmer grader

- Add `src/retrieval.js`. `EVAL_SCHEMA` and `probe-eval.md` are slimmed; fidelity moves to code;
  retrieval is written by the harness; the grader is blinded; refusals are not graded;
  `geo-audit.md` step 2 is reworded. The collector recomputes legacy hits.
- **Done when:**
  - The p10 regression test asserts a **hit** via mention.
  - Recomputed legacy hits equal the stored values on 20/20 probes.
  - Code-computed fidelity equals the stored value on 20/20.
  - The grader user message contains no model identity.
  - Grader output tokens on a 10-probe re-run are lower than before, measured through `onUsage`.

### PR 2: probe-set identity, resume, and the CSV

- `source_hash` and `probe_set_id`; the backfill script; hash-skip plus `--force`; resume with
  atomic writes; `src/dashboard/matrix.js`; `probe-matrix.csv`.
- **Done when:**
  - Re-running `gen-probes` on an unchanged URL makes no API call.
  - A `probe` run killed after its first batch and re-run asks only the remaining probes.
  - Error rows are retried on re-run, and a `probe_set_id` mismatch starts fresh with a warning.
  - `probe-matrix.csv` opens correctly in a spreadsheet with a prompt containing `,` and `"`.

### PR 3: provider seam, OpenAI, and the matrix tab

- Record one real OpenAI web-mode response as a fixture first (the ½-day spike, OpenAI only),
  and confirm or correct the field table in Decision 4.
- Add `src/providers.js`; move the Anthropic path; add `openaiAsk`; `-m a,b`; `headlineRun`;
  the matrix tab, badges, Models column, stale-run handling, and methodology columns.
- **Done when:**
  - `probe results/workflow-using-randomness/probes.json -m claude-opus-4-8,openai:gpt-5.5`
    produces two run files and a two-column matrix.
  - The adapter test passes offline against the fixture.
  - The 4-page dashboard renders with no change except badges.
  - Every fidelity figure in the UI names its model.

## Acceptance criteria

- [ ] Retrieval hit is computed in code from citations **and** scheme-less URL mentions; p10 = hit
- [ ] Closed-mode `hit_expected_source` is `null`, rendered `—`
- [ ] Fidelity computed in code; grader schema has no retrieval, id, model, or fidelity fields
- [ ] Grader prompt contains no model identity; refusals are not graded
- [ ] `score --probe-results` works unchanged on both old and new run files
- [ ] `probes.json` carries `source_hash` and `probe_set_id`; neither depends on `generated_at`
- [ ] `gen-probes` makes no API call for unchanged content unless `--force`
- [ ] `probe` resumes: only missing and errored probes are asked; writes are atomic
- [ ] A run on a different `probe_set_id` is never merged or compared; it's shown as stale
- [ ] `-m claude-opus-4-8,openai:gpt-5.5` works; bare `claude-*` ids are unchanged
- [ ] `parseModelSpec` splits on the first `:` only; legacy ids normalize to `anthropic:`
- [ ] `results/<slug>/probe-matrix.csv` after every run, RFC-4180 quoted
- [ ] Dashboard Probes tab is a probe × model matrix with spread, `n answered/N`, and hit markers
- [ ] Every fidelity figure in the UI names the model it comes from; corpus figures use `headlineRun`
- [ ] Run summaries carry a usage block split by model-under-test and grader
- [ ] `npm test` passes offline; no new npm dependencies

### Tests to write

- `retrieval.test.js`:
  - `normalizeUrl` cases: scheme, `www.`, trailing slash, `.md` twin, query, fragment
  - a mention inside backticks and inside prose
  - no false hit on a sibling path (`/using-randomness-advanced`)
  - p10 from the stored answer
- `providers.test.js`:
  - `parseModelSpec` cases: bare `claude-*`, `openai:gpt-5.5`, colon-bearing model ids, an
    unknown provider
  - `openaiAsk` parsing from the fixture
  - throws on an unrecognized shape
- `matrix.test.js`:
  - pivot with a partial column (7/10)
  - a stale run excluded
  - CSV escaping
  - refusal and closed-mode cells empty
  - `probe_set_id` stable across a whitespace-only reformat of `probes.json`
- Existing `parse-audit` and `checks` tests stay green.

## Deferred (additive later; nothing above blocks them)

| Item | Revisit when |
|---|---|
| Gemini, Perplexity, and OpenRouter adapters | the 2-model matrix proves useful. Known hazards: Gemini `groundingChunks[].web.uri` are `vertexaisearch…/grounding-api-redirect/` URLs needing resolution; Perplexity cites via `search_results` and Sonar Pro omits search counts |
| Answers/grades split, `regrade` command, grader-key comparability | the cost plan's grader-agreement study (its Phase 4) starts |
| `--runs k` variance | two models differ by less than a few points and noise matters |
| Models view leaderboard and pairwise wins | there are ≥3 models or ≥10 probed pages |
| Multi-page `probe`, `gen-probes --from` | corpus plan Phase 3 (a shell loop works until then) |
| Dashboard answer-size budget | `dashboard.html` exceeds ~2 MB |
| Batch grading | cost plan Phase 2. Note: OpenAI's Batch API rejects `web_search`, so OpenAI web-mode asking can't be batched; Anthropic batches do support server tools |
| Boilerplate-stripping before grading | blinding proves insufficient in a cross-family check |
| `models` command, `--dry-run` | provider count makes the README table insufficient |

## Alternatives considered

| Alternative | Why not |
|---|---|
| JSONL store with answers and grades split (the first draft) | It solves re-grading and history, which nobody needs yet, and brings append-safety, ID-scheme, and migration questions. The per-model run file already is the store |
| Grade all models' answers to a probe in one judge call | It couples grades, so a model added later is graded in a different context. It adds anchoring and position bias, and saves little because the source is already a cached prefix |
| promptfoo, Inspect AI, or the Vercel AI SDK | Their normalization lags exactly on web-search and citation shapes, which are the fields this tool depends on, and they add heavy dependencies to a four-dependency CLI |
| Mean fidelity across models as the page headline | Pages probed by different model sets become incomparable |

## Risks

| Risk | Mitigation |
|---|---|
| The mention matcher over-counts (the answer names the URL but the model never read it) | A mention is a documented `via: "mention"` and shown with its own marker, so a reader can split it out. The grader already counted these as hits, so no stored number moves |
| The OpenAI response shape drifts | The fixture test, plus the adapter throwing on unknown shapes |
| A Claude grader favors Claude answers | Blinding now; disclosed on Methodology; a cross-family check is deferred with a trigger |
| The slimmed grader prompt shifts scores | The rubric text is kept word-for-word. After PR 1, re-grade one page and compare against the stored grades, reporting the mean absolute fidelity delta in the PR |

## References

- Model-under-test path: `src/evaluate.js:121-221`; `bodyUrls` scheme-only regex: `src/evaluate.js:101`
- Grader call; the harness overwrites ids at `src/evaluate.js:274-275`; `MODEL:` line at `:248`
- Grader schema: `src/evaluate.js:10-75`; grader prompt: `prompts/probe-eval.md`
- Auditor's use of probe results: `prompts/geo-audit.md:61-73, 193-200`
- `runClaude` return contract: `src/claude.js:37-103`
- Probe schema and generation: `src/probes.js:8-121`
- Output naming: `src/cli.js:279-281`; default probe target: `src/cli.js:19`
- `primaryRun` and dependent aggregates: `src/dashboard/collect.js:104-201`; probe tab: `src/dashboard/render.js:232-319`
- Evidence: `results/workflow-using-randomness/probe-results-opus-4-8-web.json` (p10),
  `results/concepts-non-determinism-go/probe-results-opus-4-8-web.json`
- OpenAI web search (Responses API, `url_citation`): https://developers.openai.com/api/docs/guides/tools-web-search
- OpenAI Batch rejects web search: https://community.openai.com/t/batch-api-is-web-search-supported-for-v1-responses-getting-web-search-unsupported-on-every-line/1361886
- Gemini redirect-URL limitation (deferred): https://discuss.ai.google.dev/t/feature-request-provide-actual-source-urls-in-grounding-metadata/107352
- Anthropic batch processing (server tools supported): https://platform.claude.com/docs/en/build-with-claude/batch-processing

## Review log

The first draft was reviewed by DHH-style, Kieran-style, and simplicity reviewers on
2026-09-10. Changes:

- **Scope cut ~65%.** Five providers became two. The JSONL store became the existing per-model
  files plus resume. The Models view, `--runs`, `--regrade`, `pool.js`, reference-model config,
  and the corpus flags were all deferred.
- **The p10 evidence was reversed.** The first draft called p10 a grader error and "corrected"
  the hit rate from 30% to 20%. It was a scheme-less URL mention that our regex missed; the
  grader was right.
- **Hash inputs are now defined.** They exclude `generated_at`, and the extractor-change
  behavior is documented.
- **Auditor input is kept intact.** The harness writes `retrieval`, so the `score -p` contract
  holds.
- **Usage capture** goes through a non-breaking `onUsage` callback in `claude.js`.
- **Also added:** closed-mode `null` hits, refusals not graded, atomic writes with a
  single-writer rule, and `parseModelSpec` splitting on the first `:` only.
