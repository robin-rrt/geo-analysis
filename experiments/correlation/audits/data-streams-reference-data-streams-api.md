# GEO Audit — Data Streams Reference

**URL:** https://docs.chain.link/data-streams/reference/data-streams-api
**Analyzed:** 2026-09-18T14:45:29.114Z
**Content type:** developer documentation / reference index (hub page)

## GEO Score: 41/100 — Developing

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 4 | 6.0 |
| Structural scannability & chunkability | 15 | 6 | 9.0 |
| Concrete statistics & specifics | 12 | 1 | 1.2 |
| Citations & authoritative references | 10 | 3 | 3.0 |
| Quotable canonical definitions | 8 | 2 | 1.6 |
| Machine-readability & metadata | 12 | 6 | 7.2 |
| Code completeness & agent-runnability | 10 | 3 | 3.0 |
| Query/intent coverage | 10 | 4 | 4.0 |
| Clarity, fluency & terminology consistency | 8 | 7 | 5.6 |
| **Total** | **100** | | **40.6** |

## Summary

This is a navigation hub for the Chainlink Data Streams reference section — 124 words, 20 internal links, zero prose body, zero code, zero numerals. It does its structural job well (clean link taxonomy across API/SDK/Auth/Verification), but as a GEO artifact it is nearly inert: an engine that retrieves this page for "Chainlink Data Streams API" finds nothing self-contained to quote and will fall back to parametric priors or a child page. The single biggest opportunity is a short answer-first intro that defines Data Streams, states its canonical access model and concrete specifics, and links onward — converting a pure link list into a liftable, citable landing page.

## Dimension analysis

- **Answer-first extractability (4):** No opening sentence answers "what is the Data Streams API." The page starts cold with `### API Interfaces`. Link descriptors ("HTTP-based interface for simple integrations") are the only liftable text and they describe sub-pages, not the product.
- **Structural scannability (6):** Clean, logical grouping and consistent bullet descriptors. Weakened by a measured H1→H3 level skip (no H2s) and by sections so short (median 16 words) they carry little standalone retrieval value.
- **Concrete statistics (1):** Zero numerals, zero units, zero version strings measured. No latency, no supported-chain counts, no report-schema versions — all of which belong on a Data Streams reference root.
- **Citations & references (3):** 20 internal links, 0 external. Appropriate for a hub, but no link to the canonical Data Streams concept/product page or any primary spec to anchor authority.
- **Quotable canonical definitions (2):** "Data Streams" is never defined on the page; it is assumed known. No verbatim-liftable one-liner exists.
- **Machine-readability (6):** Valid `TechArticle` + `BreadcrumbList` JSON-LD, canonical URL, OG/Twitter tags all present. Undercut by auto-generated `about` entries ("Content about data", "Content about api"), keyword-stuffed `keywords` (18 entries, tokenized from the description), and `datePublished` == `dateModified` (no genuine freshness signal).
- **Code completeness (3):** No code — defensible for an index page, since snippets live on child pages. Not penalized as if code were expected here.
- **Query/intent coverage (4):** Covers the four navigational buckets but nothing phrased as a user question ("how do I authenticate…", "which SDK should I use…"). No verification-method comparison to guide EVM vs Solana vs Stellar choices.
- **Clarity & terminology (7):** Prose is clean and consistent; product naming ("Data Streams", "SDK", "REST API") is uniform. Nothing ambiguous — just thin.

## Prioritized recommendations

- **[P1] Add an answer-first intro paragraph** — *Maps to: answer-first extractability, quotable canonical definition*
  - **Where:** Immediately under the `# Data Streams Reference` H1, before `### API Interfaces`.
  - **Issue:** Page opens directly on `### API Interfaces` with no definition.
  - **Change:** Add 2–3 sentences: a crisp canonical definition ("Chainlink Data Streams is a pull-based (on-demand) low-latency market-data service delivering signed reports that are verified onchain or offchain…") plus what this reference section contains and where to start.
  - **Why it lifts GEO:** Gives engines a self-contained, quotable chunk instead of a bare link list; defends against parametric fallback when this page is retrieved for the product name.

- **[P1] Inject concrete specifics into the intro** — *Maps to: concrete statistics & specifics*
  - **Where:** New intro paragraph and/or link descriptors.
  - **Issue:** Zero numerals measured across the page.
  - **Change:** State quantifiable facts — report update frequency/latency, the pull model, number/names of supported chains (EVM, Solana, Stellar), and report-schema versions. E.g. "verification is supported on EVM chains, Solana, and Stellar."
  - **Why it lifts GEO:** Quantitative claims are among the highest-lift changes for citation; a numberless reference root rarely gets quoted.

- **[P2] Add a verification-method comparison table** — *Maps to: machine-scannability & justification structure, query coverage*
  - **Where:** Under `### Verification`.
  - **Issue:** Verification links are split by chain with no guidance on onchain vs offchain trade-offs.
  - **Change:** Small table: Chain | Onchain verification | Offchain verification | when to use — with links in cells.
  - **Why it lifts GEO:** Lets engines extract *reasons* and build justified answers to "how do I verify Data Streams reports on Solana."

- **[P2] Fix auto-generated schema entities** — *Maps to: machine-readability & metadata*
  - **Where:** `TechArticle` JSON-LD `about` and `keywords`.
  - **Issue:** `about` = "Content about data / streams / api…"; `keywords` is the description tokenized ("for", "and" included).
  - **Change:** Replace `about` with real entities (Chainlink Data Streams, Report Verification, Data Streams SDK) and prune `keywords` to a handful of genuine terms; remove stopwords.
  - **Why it lifts GEO:** Template placeholder entities add no entity-resolution value and signal low-effort metadata to parsers.

- **[P2] Phrase headings/descriptors as user questions** — *Maps to: symptom/query coverage*
  - **Where:** Section headings and link descriptors.
  - **Issue:** Concept-titled sections ("SDK Integration", "Authentication") don't match query phrasing.
  - **Change:** Add question-style context, e.g. under Authentication note "API keys are not required when using the Go or Rust SDKs" (already implied — surface it as its own liftable line); consider a one-line "Which SDK should I use?" pointer.
  - **Why it lifts GEO:** Devs query by task/symptom; question-shaped text wins retrieval that concept titles lose.

- **[P3] Add H2 structure to remove the level skip** — *Maps to: structural scannability*
  - **Where:** Heading hierarchy (measured 1 level skip).
  - **Issue:** H1 jumps to H3; no H2s.
  - **Change:** Promote the four top groups (API Interfaces, SDK Integration, Authentication, Verification) to H2, keeping chain sub-headings at H3.
  - **Why it lifts GEO:** Clean hierarchy improves chunk-boundary detection for RAG.

- **[P3] Link to the canonical concept page** — *Maps to: citations & authoritative references*
  - **Where:** Intro paragraph.
  - **Issue:** No link from this reference root to the Data Streams product/overview page.
  - **Change:** Add an inline link to the Data Streams concept page on first mention.
  - **Why it lifts GEO:** Establishes the canonical-hub relationship and raises attributability.

## Anti-patterns found

- Keyword-stuffed `keywords` field (18 entries including stopwords "for", "and") — tokenized from the meta description.
- Placeholder JSON-LD `about` entities ("Content about data", "Content about api") — auto-generated template, no semantic value.
- Stale-signal dates: `datePublished` identical to `dateModified` — no genuine revision/freshness signal.
- Thin content / near-empty body: 124 words, no standalone prose — a link list with no liftable definition.

## Off-page / out-of-scope notes

- Consider an `llms.txt` at site level that points agents to canonical Data Streams entry points; this hub page is a natural anchor for it.
- Freshness cadence is a site-generation issue: identical publish/modify timestamps across pages suggest generator-stamped dates — wire real last-updated values from source control.
- The CLI should pass raw `<head>` (done here) for full metadata reads; JSON-LD validated cleanly.
