# GEO Audit — Chainlink Functions

**URL:** https://docs.chain.link/chainlink-functions
**Analyzed:** 2026-09-18T14:48:31.960Z
**Content type:** developer documentation / product overview (landing page)

## GEO Score: 63/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 7 | 10.5 |
| Concrete statistics & specifics | 12 | 2 | 2.4 |
| Citations & authoritative references | 10 | 6 | 6.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 4 | 4.0 |
| Query/intent coverage | 10 | 6 | 6.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **62.9** |

## Summary

This is the top-level overview page for Chainlink Functions — a conceptual landing page that defines the product, lists use cases, and routes to deeper docs. Its biggest GEO strength is a crisp, liftable opening definition and clean, unambiguous prose. Its biggest opportunity is concreteness: the page contains **zero numerals** and leans on vague quantifiers ("several," "most"), so an engine answering "how many networks / what are the limits / what does it cost" gets nothing quotable here and will fall back to priors or sibling pages. Solid but under-specified — a strong skeleton that gives generative engines little hard fact to cite.

## Dimension analysis

- **Answer-first extractability** — Strong. Opens with a self-contained answer: "Chainlink Functions provides your smart contracts access to trust-minimized compute infrastructure, allowing you to fetch data from APIs and perform custom computation." Sections lead cleanly. No action needed.
- **Structural scannability & chunkability** — Good hierarchy (1 H1, H2s, 0 level skips, no section over 600 words). Weak spot: "Supported networks" is a one-line pointer, a thin chunk that carries no extractable fact.
- **Concrete statistics & specifics** — Weakest dimension. Measured facts confirm 0 numerals, 0 units, and vague quantifiers "several, most." No DON node count, request timeout, gas/response-size limits, supported-network count, or LINK cost model anywhere.
- **Citations & authoritative references** — Adequate for an overview: 13 links, 11 internal to canonical concept pages. 0 primary-source/spec links; the external ones are the Playground and a community site, not authoritative references.
- **Quotable canonical definitions** — Strong. The threshold-encryption and DON-consensus explanations are each verbatim-liftable one-to-two-sentence statements.
- **Machine-readability & metadata** — Valid TechArticle + BreadcrumbList JSON-LD, canonical URL, full og/twitter set. Weaknesses: `datePublished` and `dateModified` are identical (generator-stamped, no real freshness signal), and `about` entries are the auto-generated "Content about chainlink/functions" template — no entity value.
- **Code completeness & agent-runnability** — 0 code blocks. Defensible for a pure overview, but a single minimal request snippet or a "hello world" pointer would raise agent utility.
- **Query/intent coverage** — Covers "what is," "when to use," "what's next." Missing high-intent queries: cost, limits, "how does it work" (only linked), and any troubleshooting.
- **Clarity, fluency & terminology consistency** — Strong; consistent naming of "Chainlink Functions," "DON," "subscription." No action needed.

## Prioritized recommendations

- **[P1] Add concrete specifics to the intro and a key-facts table** — *Maps to: concrete statistics & specifics*
  - **Where:** After the opening paragraph / before "When to use."
  - **Issue:** "0 numerals" page-wide; relies on "several," "most."
  - **Change:** Add a small facts table or bullet set with hard numbers: DON node count, per-request execution timeout, max response/return-data size, request rate/gas limits, and the LINK-funded subscription billing model. Pull canonical values from the architecture/subscriptions pages.
  - **Why it lifts GEO:** Quantitative claims are among the highest-lift changes for citation; right now nothing on this page is a quotable number.

- **[P1] Make "Supported networks" carry the fact, not just a pointer** — *Maps to: query/intent coverage + specifics*
  - **Where:** `## Supported networks`.
  - **Issue:** "See the Supported Networks page to find a list of supported networks."
  - **Change:** State the count and name the flagship chains inline (e.g. "Chainlink Functions is live on N networks, including Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche…") then link out.
  - **Why it lifts GEO:** "What networks does Chainlink Functions support" is a top query; a first-liftable-sentence answer wins retrieval that a bare link loses.

- **[P2] Add symptom/intent-phrased sections** — *Maps to: symptom-phrased query coverage*
  - **Where:** New H2s near the end.
  - **Issue:** No coverage of "how much does Chainlink Functions cost," "how does it work," or limits as headings.
  - **Change:** Add short H2s phrased as questions ("How much does Chainlink Functions cost?", "How does a Functions request work?") each opening with a one-sentence answer plus a deep link.
  - **Why it lifts GEO:** Question-phrased headings win retrieval that concept-titled prose misses, even when the body already implies the answer.

- **[P2] Fix freshness and entity metadata** — *Maps to: machine-readability & metadata*
  - **Where:** JSON-LD `dateModified` and `about`.
  - **Issue:** `dateModified` identical to `datePublished`; `about` = "Content about chainlink" template.
  - **Change:** Emit a real last-revised date, and replace the templated `about` values with genuine entity descriptions (e.g. "Decentralized serverless compute for smart contracts").
  - **Why it lifts GEO:** Visible freshness and meaningful entities support E-E-A-T and entity resolution; a stamped-identical date reads as never-revised.

- **[P3] Add one minimal, runnable example or a labeled "getting started" snippet** — *Maps to: code completeness & agent-runnability*
  - **Where:** Between the intro and "When to use," or under a new "Quick example" H2.
  - **Issue:** 0 code blocks; agents get no copyable entry point.
  - **Change:** Include a short, language-tagged Solidity request stub (or clearly link the exact minimal snippet in Getting Started), with imports.
  - **Why it lifts GEO:** Complete, labeled snippets raise agent-runnability; even one anchors the page for coding-agent retrieval.

- **[P3] Add a primary/authoritative external reference** — *Maps to: citations & authoritative references*
  - **Where:** Intro paragraph on DON consensus / threshold encryption.
  - **Issue:** 0 primary-source links; externals are Playground + community site.
  - **Change:** Link the threshold-encryption / OCR concept to a canonical spec or whitepaper.
  - **Why it lifts GEO:** Primary-source citations raise credibility and citation rate.

## Anti-patterns found

- Vague quantifiers "several," "most" used where a number belongs.
- Templated JSON-LD `about` values ("Content about chainlink") — machine metadata with no informational content.
- Identical `datePublished`/`dateModified` — stale/undated freshness signal.

## Off-page / out-of-scope notes

- Confirm `llms.txt` and sitemap expose this page and its children as a canonical hub.
- Freshness cadence is a site-level generator issue (dates stamped, not revised) — fix at the build layer so `dateModified` reflects real edits.
- Ensure sibling pages (architecture, subscriptions, supported-networks) link back to this overview to reinforce the canonical-hub pattern.
