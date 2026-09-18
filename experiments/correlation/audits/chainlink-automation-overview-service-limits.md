# GEO Audit — Chainlink Automation Service Limits

**URL:** https://docs.chain.link/chainlink-automation/overview/service-limits
**Analyzed:** 2026-09-18T14:47:14.771Z
**Content type:** developer documentation / reference (service limits)

## GEO Score: 61/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 7 | 10.5 |
| Structural scannability & chunkability | 15 | 8 | 12.0 |
| Concrete statistics & specifics | 12 | 7 | 8.4 |
| Citations & authoritative references | 10 | 3 | 3.0 |
| Quotable canonical definitions | 8 | 4 | 3.2 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 5 | 5.0 |
| Query/intent coverage | 10 | 4 | 4.0 |
| Clarity, fluency & terminology consistency | 8 | 8 | 6.4 |
| **Total** | **100** | | **61.0** |

## Summary

This is a short, clean reference page whose strength is a concrete per-chain table of log-processing limits — exactly the quantitative specificity generative engines reward. Its biggest opportunity is scope: the page is titled "Service Limits" (plural) but documents only one limit (logs per block per upkeep), leaving common queries about gas limits, timing, and balance minimums unanswered. Honest verdict: well-structured and accurate for the narrow slice it covers, but under-scoped for its title, which will cost retrieval on the many "service limit" queries it doesn't address.

## Dimension analysis

- **Answer-first extractability:** Section opens with mechanism prose ("nodes look back over a limited range…") before the actual numbers; the table is liftable but the lead sentence doesn't state a limit. Add a one-line canonical answer above the prose.
- **Structural scannability:** Strong — 1 H1, clean H2s, 0 level skips, one well-formed table (measured facts confirm). No action needed beyond adding sections.
- **Concrete statistics & specifics:** Good per-chain numbers, but measured facts note **0 of 10 numerals carry units** — "20" and "4" are unlabeled outside the table header. The Arbitrum row mixes two units in one cell.
- **Citations & authoritative references:** Weak — 0 external links, 0 primary sources. No link to Automation architecture, log-trigger concepts, or how look-back ranges are defined.
- **Quotable canonical definitions:** No crisp definition of "log trigger upkeep," "minimum dequeue method," or "service limit." These terms appear undefined near first use.
- **Machine-readability & metadata:** Solid JSON-LD (BreadcrumbList + TechArticle parse cleanly), canonical set, full og/twitter. Weakness: `datePublished` == `dateModified` (generator-stamped, no real freshness signal); `about` entries are all auto-template ("Content about X"); `programmingLanguage: TypeScript` declared with zero code on page.
- **Code completeness & agent-runnability:** No code — acceptable for a limits reference, though a small config snippet showing a manual-trigger backup would help agents.
- **Query/intent coverage:** Weakest dimension. Title promises all service limits; page covers only log processing. Missing: gas limits, check/perform gas, upkeep interval, minimum balance. No symptom-phrased heading for "why aren't all my logs processed."
- **Clarity, fluency & terminology consistency:** Strong; prose is unambiguous and consistent.

## Prioritized recommendations

- **[P1] Broaden scope to match the "Service Limits" title** — *Maps to: Query/intent coverage*
  - **Where:** Whole page / new H2 sections
  - **Issue:** Page titled "Service Limits" documents only logs per block.
  - **Change:** Add H2 sections for the other Automation limits (check gas limit, perform gas limit, upkeep gas ceiling, minimum balance, block look-back range) with their concrete values, or explicitly scope the title to "Log Processing Limits" and link out to the others.
  - **Why it lifts GEO:** A page that answers only one of many "service limit" queries loses retrieval on the rest; broader canonical coverage captures far more symptom queries.

- **[P1] Add a symptom-phrased section for dropped logs** — *Maps to: Query/intent coverage / symptom queries*
  - **Where:** Below the table
  - **Issue:** Devs query "why are some of my logs not being processed," not "maximum logs processed."
  - **Change:** Add an H3 "Why aren't all my logs being processed?" answering with the dequeue behavior and the manual-trigger backup recommendation in the first sentence.
  - **Why it lifts GEO:** Symptom-phrased headings win retrieval that concept-titled prose loses.

- **[P2] Lead the section with the canonical limit, answer-first** — *Maps to: Answer-first extractability*
  - **Where:** First paragraph under the H2
  - **Issue:** "Chainlink Automation nodes look back over a limited range…" opens with mechanism, not the limit.
  - **Change:** Prepend a liftable sentence: "Chainlink Automation processes a fixed number of logs per block per upkeep — from 20 on Ethereum down to 1 on Gnosis and Arbitrum (see table)."
  - **Why it lifts GEO:** A self-contained first sentence is what engines lift verbatim.

- **[P2] Add units and a values-per-chain caption to the table** — *Maps to: Concrete statistics & specifics*
  - **Where:** Table header / Arbitrum row
  - **Issue:** Measured facts show 0 numerals with units; Arbitrum cell mixes "per 2 blocks" and "per second."
  - **Change:** Keep header "Logs per block per upkeep"; add a note that Arbitrum's rate is block-time dependent, and label the numbers as "logs" explicitly in prose.
  - **Why it lifts GEO:** Unit-bearing quantitative claims are among the highest-lift specificity signals.

- **[P2] Add authoritative internal + primary links** — *Maps to: Citations & authoritative references*
  - **Where:** Body and "What's next"
  - **Issue:** 0 external, only 2 internal links.
  - **Change:** Link "log trigger upkeeps" to the log-trigger concept page and link "minimum dequeue method" / look-back behavior to the Automation architecture doc.
  - **Why it lifts GEO:** Inline links to canonical concept pages raise credibility and citation rate.

- **[P3] Fix freshness and metadata template artifacts** — *Maps to: Machine-readability & metadata*
  - **Where:** JSON-LD
  - **Issue:** `datePublished` == `dateModified` (identical); `about` all "Content about X"; TypeScript declared with no code.
  - **Change:** Emit a real `dateModified` on edit; replace auto-template `about` descriptions with substantive ones; drop the TypeScript `programmingLanguage` claim on a code-free page.
  - **Why it lifts GEO:** Genuine freshness and accurate entity metadata strengthen E-E-A-T and agent trust.

## Anti-patterns found

- Stale/undated signal: `datePublished` and `dateModified` are byte-identical (generator-stamped, no real revision date).
- Metadata mismatch: `programmingLanguage: TypeScript` declared but page has zero code fences.
- Auto-generated `about` entries ("Content about chainlink", "Content about limits") add no entity value.
- Scope mismatch: plural "Service Limits" title vs single-limit content.

## Off-page / out-of-scope notes

- Consider an `llms.txt` entry pointing agents to a consolidated Automation limits hub.
- Site-level freshness cadence: ensure `dateModified` reflects actual edits across docs, not build time.
- If limits are split across pages, add internal links from sibling limit pages into this one (canonical-hub pattern) so it wins "Automation service limits" retrieval.
