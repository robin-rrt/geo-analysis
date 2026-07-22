# GEO Audit — Avoiding Non-Determinism in Workflows

**URL:** https://docs.chain.link/cre/concepts/non-determinism-go
**Analyzed:** 2026-07-15T19:19:26.457Z
**Content type:** developer documentation / concept + reference

## GEO Score: 71/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 9 | 13.5 |
| Concrete statistics & specifics | 12 | 5 | 6.0 |
| Citations & authoritative references | 10 | 5 | 5.0 |
| Quotable canonical definitions | 8 | 7 | 5.6 |
| Machine-readability & metadata | 12 | 8 | 9.6 |
| Code completeness & agent-runnability | 10 | 6 | 6.0 |
| Query/intent coverage | 10 | 6 | 6.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **70.9** |

## Summary

This is a well-structured, scannable concept page that pairs a "Don't Use / Use Instead" table with per-topic problem/solution sections and a Do/Don't summary — near-ideal chunking for RAG. Its single biggest strength is machine-scannable justification structure; its biggest opportunity is **parametric-prior resistance**: the table's "Sort keys first, then iterate" phrasing legitimizes the generic `sort.Strings` substitute over the canonical `cre.OrderedEntries` helper. Honest verdict: solid best-in-class docs, held back on concrete specifics, external citations, and symptom-phrased retrieval hooks.

## Dimension analysis

- **Answer-first extractability** — Strong. The lead defines the failure crisply: "If nodes execute different code paths, they generate different request IDs... and consensus fails." Each section states problem then bolded solution. Minor: sections open with the *problem* rather than the canonical API first-liftable sentence.
- **Structural scannability & chunkability** — Strong; no action needed. Numbered H2 sections, upfront reference table, mirrored Do/Don't lists. Each section is a coherent retrievable unit.
- **Concrete statistics & specifics** — Weak. Almost no version/parameter specifics beyond "json v1/v2"; no CRE SDK version, no note that this applies to DON mode only vs other execution modes, no consensus quorum threshold.
- **Citations & authoritative references** — Weak. Only internal links. Claims like "Go maps are designed to iterate in random order" and "json v2 uses random hashing" would gain credibility from links to the Go spec / Go blog / protobuf docs.
- **Quotable canonical definitions** — Good. DON Time defined as "a consensus-derived timestamp that all nodes agree on." Non-determinism itself lacks a single verbatim-liftable one-sentence definition near the top.
- **Machine-readability & metadata** — Strong. Canonical URL, `TechArticle`+`LearningResource` JSON-LD, published/modified dates present. Weakened by a stuffed `keywords` field and nonsensical `about[]` entities ("Non", "Determinism" split as separate Things).
- **Code completeness & agent-runnability** — Mixed. Map examples have imports but no package/func wrapper or `processPrice` definition and no output; JSON, proto, `select`, time, and rand sections give prose solutions with **no code at all**.
- **Query/intent coverage** — Mixed. Full lifecycle of pitfalls covered, but headings are concept-titled ("Time and dates") not symptom-phrased ("workflow fails to reach consensus", "different request IDs on each node"). No error-string or troubleshooting entry point.
- **Clarity, fluency & terminology consistency** — Strong; no action needed. Consistent CRE/DON/SDK naming, unambiguous prose.

## Prioritized recommendations

- **[P1] Kill the prior-legitimizing phrasing in the table** — *Maps to: parametric-prior resistance*
  - **Where:** Quick reference table, row 1
  - **Issue:** "Sort keys first, then iterate (`cre.OrderedEntries`)"
  - **Change:** Replace with "Use `cre.OrderedEntries` (or `cre.OrderedEntriesFunc`)". Drop "sort keys first" as the lead phrasing so engines don't emit `sort.Strings`/manual sort as the answer.
  - **Why it lifts GEO:** Generic "sort keys first" invites the ecosystem idiom over the SDK helper; naming the canonical API first defends against parametric substitution.

- **[P1] Add symptom/error-phrased headings and an entry sentence** — *Maps to: symptom-phrased query coverage*
  - **Where:** Section titles and/or a new short "Symptoms" list under the intro
  - **Issue:** Headings are concept-named ("4. Time and dates") — miss "why does my workflow fail consensus" queries.
  - **Change:** Add a bulleted symptom list linking to sections, e.g. "Nodes generate different request IDs", "Consensus/quorum fails intermittently", "Same data serializes to different JSON on different nodes". Optionally append symptom clauses to headings.
  - **Why it lifts GEO:** Devs/agents query by symptom, not concept name; symptom-phrased anchors win retrieval that concept titles lose.

- **[P2] Add code snippets to the prose-only sections** — *Maps to: code completeness & agent-runnability*
  - **Where:** Sections 2 (JSON/proto), 3 (select), 4 (time), 5 (rand)
  - **Issue:** Solutions stated in prose only, e.g. "Use `proto.MarshalOptions{Deterministic: true}.Marshal()`" with no snippet.
  - **Change:** Add a minimal, imported, copy-pasteable Go snippet per section (e.g. `runtime.Now()` usage, deterministic proto marshal call).
  - **Why it lifts GEO:** Complete runnable snippets are directly liftable by coding agents; prose-only fixes are harder to synthesize accurately.

- **[P2] Add authoritative external citations** — *Maps to: citations & authoritative references*
  - **Where:** Sections 1, 2 (map iteration, json v2)
  - **Issue:** "Go maps are designed to iterate in random order" — unattributed.
  - **Change:** Inline-link the Go spec on map iteration order and the `encoding/json`/protobuf reference docs.
  - **Why it lifts GEO:** Primary-source links raise credibility and citation rate.

- **[P2] Add concrete specifics** — *Maps to: concrete statistics & specifics*
  - **Where:** Intro and section leads
  - **Issue:** No version or scope numbers (SDK version, "DON mode only", quorum context).
  - **Change:** State the `cre-sdk-go` version these APIs require, and clarify determinism matters specifically in DON consensus mode.
  - **Why it lifts GEO:** Quantitative/version specifics are among the highest-lift changes for retrieval and trust.

- **[P3] Fix stuffed JSON-LD `keywords` and `about[]`** — *Maps to: machine-readability & metadata*
  - **Where:** `TechArticle` JSON-LD
  - **Issue:** `keywords:"Learn, how, avoid, ... that, prevent..."` and `about:[{"name":"Non"},{"name":"Determinism"}]`.
  - **Change:** Replace with real entity terms ("Chainlink CRE", "workflow determinism", "DON consensus", "Go SDK") and coherent `about` Things.
  - **Why it lifts GEO:** Broken entity metadata harms entity resolution; keyword stuffing is neutral-to-negative.

## Anti-patterns found

- Keyword-stuffed `keywords` field and fragmented `about[]` entities in JSON-LD.
- "Sort keys first" phrasing legitimizes the generic non-SDK substitute (parametric-prior risk).
- Several sections give prose-only solutions with no accompanying code.

## Off-page / out-of-scope notes

- Confirm `docs.chain.link` publishes an `llms.txt` and that this page is included; not verifiable from page content.
- Freshness cadence is healthy (published 2025-11-04, modified 2026-04-20) — maintain visible last-updated on future SDK changes.
- Internal inbound links from sibling hubs (Consensus Computing, Time in CRE) into this page would strengthen it as the canonical non-determinism hub.
