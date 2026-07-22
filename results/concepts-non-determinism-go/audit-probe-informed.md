# GEO Audit — Avoiding Non-Determinism in Workflows

**URL:** https://docs.chain.link/cre/concepts/non-determinism-go
**Analyzed:** 2026-07-15T21:33:35.081Z
**Content type:** developer documentation / concept + reference

## GEO Score: 75/100 — Strong

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 9 | 13.5 |
| Structural scannability & chunkability | 15 | 9 | 13.5 |
| Concrete statistics & specifics | 12 | 6 | 7.2 |
| Citations & authoritative references | 10 | 6 | 6.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 8 | 9.6 |
| Code completeness & agent-runnability | 10 | 7 | 7.0 |
| Query/intent coverage | 10 | 5 | 5.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **75.4** |

## Summary

This is a well-structured, answer-first concept page with a strong quick-reference table, clean do/don't lists, and solid `TechArticle` JSON-LD. Its biggest GEO strength is extractability; its biggest opportunity is **retrieval and parametric-prior resistance, not prose**. The score↔fidelity gap is the headline: a Strong 75/100 page scored only **55.6 avg fidelity** with a **20% retrieval hit rate** — the loss is dominated by (a) the model not retrieving the page and answering from generic priors, and (b) even when it *did* retrieve, the model substituted the generic `sort.Strings` idiom for the SDK's `cre.OrderedEntries`. Prose polish is not the fix; discoverability and canonical-API-first framing are.

## Probe-informed diagnosis

**GEO score vs probe fidelity:** 75/100 vs 55.6/100 — a retrieval + parametric-prior problem, not a content-quality problem.

| Retrieval | Probes | Avg fidelity |
|-----------|:------:|:------------:|
| Hit expected source | 2 | 67.5 |
| Missed | 8 | 52.6 |

- **Miss triage:**
  - p02 → likely retrieved (answer names the URL in body text) but citation not captured → **harness / citation-parsing artifact**
  - p03 → **query-phrasing/parametric** (code-first prompt; page not surfaced, generic sort used)
  - p04 → **query-phrasing** (symptom prompt "different request IDs across nodes"; no CRE heading matches it)
  - p05 → **infrastructure** (search tool hit usage limit)
  - p06 → **infrastructure** (search tool hit usage limit)
  - p07 → **infrastructure** (search timed out)
  - p08 → **query-phrasing/entity** (model failed to map "DON mode" → Chainlink CRE)
  - p09 → **infrastructure** (search rate limit)
- **Parametric overrides (hit source, wrong answer):** p01 — hit the page but recommended `sort.Strings(keys)` manual sorting instead of the documented `cre.OrderedEntries`; p03 shows the same manual-sort prior without retrieval. The page's own table wording ("Sort keys first, then iterate") legitimizes the substitute.
- **Confident inversions:** p07 — recommends **Chainlink VRF / `fulfillRandomWords`** for in-workflow randomness instead of `runtime.Rand()` (wrong product entirely); p05 — "Both v1 and v2 sort map keys when marshaling" directly **contradicts** the page's key fact that json v2 uses random field hashing. Both occurred on unretrieved answers → unretrieved answers on randomness and JSON serialization are **unsafe, not merely incomplete**.
- **Harness artifacts excluded from page blame:** p05, p06, p07, p09 (4 probes) all failed on search rate-limit/timeout, not page quality. Excluding them, the **true hit rate is 2/6 ≈ 33%**, and effective avg fidelity rises but retrieval is still the dominant loss.

## Dimension analysis

- **Answer-first extractability** — Strong; each section leads with the problem then a bolded solution, and the failure pattern ("Code diverges → Different request IDs → No quorum → Workflow fails") is a clean liftable chunk.
- **Structural scannability** — Strong; numbered H2 sections, quick-reference table, do/don't lists chunk cleanly for RAG. No action needed.
- **Concrete statistics & specifics** — Weak for the genre: no Go version, SDK version, or consensus threshold (e.g. quorum fraction) anchors. Add version/config specifics.
- **Citations & authoritative references** — Only internal CRE links; no external primary sources (Go spec on map iteration randomization, protobuf deterministic-marshal docs) to raise attributable authority.
- **Quotable canonical definitions** — Strong; the request-ID/consensus mechanism is crisply stated and was lifted verbatim by p01/p10.
- **Machine-readability & metadata** — Strong: canonical URL, `TechArticle`/`LearningResource` JSON-LD, `dateModified` 2026-04-20. Minor: `keywords` and `about` entities are auto-split junk ("Non", "Determinism") — clean these for entity resolution.
- **Code completeness** — Mostly good (imports shown); the `cre.OrderedEntriesFunc` struct-literal example has awkward syntax and no expected output. Minor polish.
- **Query/intent coverage** — Weakest dimension and the retrieval bottleneck: sections are concept-titled, so symptom queries (p04 "different request IDs", p08 "select statement in DON mode") don't match. No troubleshooting/FAQ framing.
- **Clarity & terminology** — Strong; consistent use of "DON mode", "consensus", SDK names.

## Prioritized recommendations

### Tier 1 — Retrieval & discoverability
*Largest measured loss: 80% of probes missed the page; ~half of misses are query-phrasing/entity, the rest infra.*

- **[P1] Add symptom- and error-phrased headings/sections** — *Maps to: symptom-phrased query coverage*
  - **Where:** new H2/H3s near "The problem" and section 3.
  - **Issue:** p04 (symptom prompt) and p08 (select/DON prompt) never retrieved the page though it answers both.
  - **Change:** add headings such as "Why does my workflow fail consensus with different request IDs across nodes?" and "Why does a `select` statement break consensus in DON mode?" with the answer in the first sentence.
  - **Why it lifts GEO:** headings matching the exact symptom string win retrieval that concept titles lose (p04, p08).

- **[P1] Bind the "DON mode" entity to Chainlink CRE explicitly** — *Maps to: entity resolution / parametric-prior resistance*
  - **Where:** first sentence under "The problem".
  - **Issue:** p08 — "couldn't find any concept called 'DON mode'"; model didn't connect it to CRE.
  - **Change:** open with "In the Chainlink Runtime Environment (CRE), workflows run in **DON mode** (Decentralized Oracle Network)…" spelling out the acronym once.
  - **Why it lifts GEO:** lets engines resolve the jargon to the product and retrieve/attribute correctly.

- **[P2] Add an internal canonical-hub link into this page** — *Maps to: outranked / internal linking*
  - **Where:** from CRE consensus and workflow overview pages.
  - **Issue:** page surfaced in only 2/10 probes.
  - **Change:** link "avoiding non-determinism" from the CRE Concepts index and Consensus Computing page.
  - **Why it lifts GEO:** raises the page's retrievability as the canonical answer for these queries.

### Tier 2 — Parametric-prior resistance
*Directly fixes p01 (hit source, wrong answer) and the p03/p05/p07 priors.*

- **[P1] Lead the map-iteration fix with the SDK helper; name `sort.Strings` as a Don't** — *Maps to: parametric-prior resistance*
  - **Where:** Quick-reference table row 1 and section 1.
  - **Issue:** table says "Sort keys first, then iterate (`cre.OrderedEntries`)" — the phrasing "sort keys first" invited p01's `sort.Strings(keys)` substitution.
  - **Change:** change the cell to "Use `cre.OrderedEntries` (or `cre.OrderedEntriesFunc` for non-`cmp.Ordered` keys)" and add an explicit Don't: "Don't hand-roll `sort.Strings`/`sort.Slice` on a key slice — use the SDK helper." Lead section 1's solution sentence with `cre.OrderedEntries`, not "sort your keys."
  - **Why it lifts GEO:** p01 retrieved the page yet the prior beat it because the wording legitimized the generic idiom; answer-first canonical API defends against this.

- **[P2] Strengthen the randomness and JSON sections against inversion** — *Maps to: confident-inversion defense*
  - **Where:** sections 5 and 2.
  - **Issue:** unretrieved p07 recommended Chainlink VRF (wrong product); p05 claimed "both v1 and v2 sort map keys" (opposite of the page).
  - **Change:** add a one-line Don't to section 5 ("Don't use Chainlink VRF for in-workflow randomness — use `runtime.Rand()`") and bold the json v2 fact ("json v2 randomizes field order; v1 is deterministic — do not assume either sorts keys").
  - **Why it lifts GEO:** names the exact wrong-but-tempting answers so a retrieved page overrides the prior; also improves the fact even when only skimmed.

### Tier 3 — On-page polish
*Real but smaller lift while retrieval is the bottleneck.*

- **[P2] Add external authoritative citations** — *Maps to: cited references*
  - **Where:** sections 1, 2, 3.
  - **Issue:** no primary-source links.
  - **Change:** link the Go spec note on randomized map iteration and the protobuf `Deterministic` marshal docs inline.
  - **Why it lifts GEO:** raises attributable credibility and citation rate.

- **[P3] Add version/config specifics** — *Maps to: concrete specifics*
  - **Where:** intro or code blocks.
  - **Issue:** no Go/SDK version or module version pinned.
  - **Change:** state the `cre-sdk-go` version the helpers require and the minimum Go version.
  - **Why it lifts GEO:** quantitative/version specifics are high-lift and help agents run the code.

- **[P3] Fix the `OrderedEntriesFunc` struct-literal example and add expected output** — *Maps to: agent-runnability*
  - **Where:** section 1 second snippet.
  - **Issue:** `map[Asset]float64{{symbol: "BTC"}: 50000}` is awkward/likely non-compiling as written.
  - **Change:** make it a complete, compiling snippet with a `// Output:` comment.
  - **Why it lifts GEO:** copy-pasteable code raises agent trust and reuse.

### Tier 4 — Measurement fixes
*Correct the metric, not the page — 4/10 probes failed on harness limits.*

- **[P1] Add retry/backoff on search rate limits** — p05, p06, p07, p09 all failed on tool usage limits/timeouts; without them the true hit rate is 2/6, not 2/10.
- **[P2] Parse citations from answer bodies, not just the cited-URL list** — p02 named the page URL in prose but was scored a miss; body-text citations are under-counted.
- **[P3] Add a `--mode closed` baseline** — p05/p07/p09 expose the parametric floor (VRF, json-v2 inversion); a closed-book run quantifies how unsafe unretrieved answers are on randomness/serialization.

## Anti-patterns found

- **Auto-generated junk metadata:** JSON-LD `keywords` is a tokenized sentence ("Learn, how, avoid, non-deterministic…") and `about` entities are split fragments ("Non", "Determinism"). Not harmful to humans but weakens machine entity resolution.
- **Concept-titled sections only** — no symptom/error-phrased entry points (drives the retrieval misses above).
- No keyword stuffing, no marketing fluff, no unresolved cross-references. Prose is clean.

## Off-page / out-of-scope notes

- **`llms.txt` / site-level surfacing:** ensure this page is listed in any `llms.txt` and the CRE sitemap so agents can find it without full-text search.
- **Freshness cadence:** `dateModified` 2026-04-20 is current; keep it updated as the `cre-sdk-go` API evolves (helper names are the exact thing priors get wrong).
- **Harness rate limits** (Tier 4) are measurement infrastructure, not page issues — 40% of this run's misses are attributable to them.
