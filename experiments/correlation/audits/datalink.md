# GEO Audit — DataLink

**URL:** https://docs.chain.link/datalink
**Analyzed:** 2026-09-18T14:46:20.769Z
**Content type:** developer documentation / product overview (conceptual)

## GEO Score: 64/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 8 | 12.0 |
| Concrete statistics & specifics | 12 | 3 | 3.6 |
| Citations & authoritative references | 10 | 5 | 5.0 |
| Quotable canonical definitions | 8 | 7 | 5.6 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 5 | 5.0 |
| Query/intent coverage | 10 | 6 | 6.0 |
| Clarity, fluency & terminology consistency | 8 | 8 | 6.4 |
| **Total** | **100** | | **64.0** |

## Summary

This is a clean, well-structured conceptual overview of DataLink that opens with a strong, liftable definition and cleanly separates pull vs push delivery. Its biggest GEO strength is answer-first structure and scannability; its biggest weakness is a near-total absence of concrete specifics — only 4 numerals in 1,055 words, none with units, and vague quantifiers ("fast," "wide range," "robust") standing in for the latencies, network counts, and version numbers that generative engines preferentially cite. As a product landing page this is acceptable prose, but it under-serves symptom/how-to queries and lacks a comparison table where one is most needed.

## Dimension analysis

- **Answer-first extractability** — Strong. Opens with a self-contained definition: "DataLink is an institutional-grade data publishing service that enables data providers to commercialize specialized market data onchain." Most sections lead with their answer. No action needed beyond the pull/push table below.
- **Structural scannability** — Strong: 11 headings, 0 level skips, 38 bullets, no section over 203 words. Weakness: 0 tables — the pull-vs-push decision is the page's key comparison and is delivered as parallel bullet lists, not an extractable table.
- **Concrete statistics & specifics** — Weak. Measured: 4 numerals, 0 with units, 0 versions. "sub-second data resolution" and "2,400+ dApps" and "tens of trillions" are the only specifics; latency figures, supported-chain counts, SDK versions, and update-interval numbers are absent.
- **Citations & authoritative references** — Middling. 26 links but 23 internal and 0 to primary sources; the 3 external links are marketing/contact pages, not specs or canonical definitions.
- **Quotable canonical definitions** — Good. Lead sentence is verbatim-liftable. Pull and push each get a one-line "Infrastructure:" anchor. Could add crisp one-line defs of "pull-based feed" vs "push-based feed" as terms.
- **Machine-readability & metadata** — Good schema (valid BreadcrumbList + TechArticle, canonical, OG/Twitter). Flaws: `datePublished` == `dateModified` (no revision signal), `keywords` are just the description tokenized, `about` is generic "Content about datalink," and `programmingLanguage: Rust` is declared with zero code on the page.
- **Code completeness & agent-runnability** — 0 code blocks. Acceptable for a conceptual overview, but agents completing DataLink tasks get no runnable entry point here; the SDK links partly compensate.
- **Query/intent coverage** — Covers "what is," "how it works," "data types," and pull-vs-push. Missing: "which delivery method should I use," FAQ/troubleshooting, and any symptom-phrased entry. Full lifecycle (setup→use→debug) is not present on-page (partly by design as a hub).
- **Clarity, fluency & terminology consistency** — Strong; consistent naming of DataLink, Data Streams, Data Feeds, DON. No action needed.

## Prioritized recommendations

- **[P1] Add a pull-vs-push comparison table** — *Maps to: machine-scannability & justification structure*
  - **Where:** "Technical Integration" section, above the Pull/Push subsections.
  - **Issue:** the key decision is split across two parallel bullet lists; 0 tables on page.
  - **Change:** add a table with rows Infrastructure, Access methods, Latency/resolution, Update pattern, Best-for use cases, Onchain cost profile — one column each for Pull and Push.
  - **Why it lifts GEO:** tables are directly extractable and let engines build a *justified* "which should I use" answer; this is the most-queried decision on the page.

- **[P1] Replace vague quantifiers with concrete numbers** — *Maps to: concrete statistics & specifics*
  - **Where:** throughout; especially "sub-second data resolution," "high-frequency," "reducing unnecessary onchain transactions," "wide range."
  - **Issue:** "fast," "quickly," "robust," "wide range" — 0 numerals with units on page.
  - **Change:** add measurable figures where accurate: actual sub-second latency (e.g. "~X ms report latency"), number of supported chains, push update intervals/heartbeat/deviation thresholds, count of specialized data types (11 listed).
  - **Why it lifts GEO:** quantitative claims are among the highest-lift changes for citation rate; qualitative prose underperforms.

- **[P2] Add a symptom/decision FAQ block** — *Maps to: query/intent coverage, symptom-phrased queries*
  - **Where:** before "What's next."
  - **Issue:** no FAQ, no "how do I choose" or "when should I use" phrasing.
  - **Change:** 3–5 Q&A entries phrased as devs ask: "Should I use pull or push delivery for DataLink?", "How do I access DataLink data from a smart contract?", "What data types does DataLink support?" each answered in one liftable sentence.
  - **Why it lifts GEO:** question-phrased headings win retrieval that concept-titled prose loses.

- **[P2] Cite primary/canonical sources inline** — *Maps to: citations & authoritative references*
  - **Where:** "Data Consensus and Delivery" (DON, oracle reports); "Pull Delivery" (verifier contracts).
  - **Issue:** 0 links to primary sources; DON and oracle-report claims are unattributed on-page.
  - **Change:** add inline links to the canonical Data Streams verification docs and DON concept page at first mention.
  - **Why it lifts GEO:** attributable claims raise credibility and citation rate.

- **[P3] Fix metadata staleness and generic fields** — *Maps to: machine-readability & metadata*
  - **Where:** JSON-LD `TechArticle`.
  - **Issue:** `datePublished` equals `dateModified` (identical — no revision signal); `about` = "Content about datalink"; `keywords` mirror the description.
  - **Change:** stamp a real `dateModified` on edit; replace `about` with a meaningful entity (e.g. "Chainlink DataLink data publishing service"); drop the Rust `programmingLanguage` claim since the page has no code.
  - **Why it lifts GEO:** visible freshness and accurate entities aid E-E-A-T and agent trust; a phantom Rust claim on a code-free page misleads parsers.

- **[P3] Add one canonical definition each for "pull-based feed" and "push-based feed"** — *Maps to: quotable canonical definitions*
  - **Where:** opening line of the Pull Delivery and Push Delivery subsections.
  - **Issue:** subsections lead with "Infrastructure:" bullets, not a definition of the term itself.
  - **Change:** prepend one sentence: "Pull-based feeds deliver cryptographically signed oracle reports offchain that consumers fetch on demand and verify onchain."
  - **Why it lifts GEO:** a crisp verbatim-liftable definition near first use outperforms diffuse explanation.

## Anti-patterns found

- Vague quantifiers standing in for data: "fast," "quickly," "robust," "wide range" (measured).
- Mild marketing tone in benefit bullets ("gaining a first-mover advantage," "seamlessly commercialize") — acceptable for a product hub but reduces liftable specificity.
- Metadata: identical publish/modify dates and a generic `about` entity.
- `programmingLanguage: Rust` declared with zero code fences on the page.

## Off-page / out-of-scope notes

- Consider an `llms.txt` entry pointing at the DataLink hub and its pull/push children (site-level).
- Freshness cadence: the identical publish/modify timestamps suggest generator-stamping; establish a real revision signal site-wide.
- As a hub page, its value grows with internal links *into* it from the pull/push/architecture child pages (canonical-hub pattern) — verify those children link back here.
