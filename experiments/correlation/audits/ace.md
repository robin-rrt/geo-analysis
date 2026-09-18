# GEO Audit — Chainlink ACE Overview

**URL:** https://docs.chain.link/ace
**Analyzed:** 2026-09-18T14:48:50.495Z
**Content type:** developer documentation / product overview

## GEO Score: 67/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 8 | 12.0 |
| Concrete statistics & specifics | 12 | 4 | 4.8 |
| Citations & authoritative references | 10 | 5 | 5.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 4 | 4.0 |
| Query/intent coverage | 10 | 7 | 7.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **66.8** |

## Summary

This is a clean, well-structured product overview for Chainlink ACE that opens with a strong, liftable canonical definition and uses question-phrased headings that match how users query. Its single biggest strength is answer-first extractability and terminology consistency; its biggest opportunity is concrete specifics — the page is almost entirely qualitative (one `$50,000` example, no supported-chain list, no limits, no version/beta details), which underperforms in generative retrieval. As an overview hub the absence of code is defensible, but the JSON-LD declares TypeScript with zero code fences, and the `keywords`/`about` metadata is auto-generated noise. Honest verdict: a solid Good page that would move to Strong with a specifics table and metadata cleanup.

## Dimension analysis

- **Answer-first extractability** — Strong. Opening sentence is a self-contained definition; each section leads with its answer ("ACE has two layers…"). No action needed.
- **Structural scannability** — Strong. 12 headings, clean H1→H3, 0 level skips, median 65-word sections. Only gap: 0 tables where the three managers and two signing models beg for one.
- **Concrete statistics & specifics** — Weak. 10 numerals, 0 with units, no version strings, no supported-chain enumeration. "across every EVM chain" is qualitative where a list of live networks would lift retrieval.
- **Citations & authoritative references** — Adequate internal linking (33 links) but 0 external/primary sources. TRM Wallet Screening, KYC/AML standards, and CRE are named without authoritative links.
- **Quotable canonical definitions** — Strong. CCID, PolicyEngine, and ACE each have crisp one-sentence definitions near first use.
- **Machine-readability & metadata** — Good bones: valid `TechArticle` + `BreadcrumbList`, canonical, published/modified dates, full og/twitter. Weakened by malformed `keywords` (tokenized on spaces incl. punctuation: `"programmable,,"`, `"contracts."`) and three template `about` entries ("Content about ace").
- **Code completeness & agent-runnability** — Weak by measurement: 0 fenced blocks yet `programmingLanguage: TypeScript` declared. Acceptable for an overview, but the declaration is a false signal.
- **Query/intent coverage** — Good. Headings "What problems does ACE solve?", "Who is ACE for?", "What is ACE?" match natural queries. Missing: "what chains does ACE support?" and any troubleshooting/FAQ.
- **Clarity, fluency & terminology consistency** — Strong; no action needed.

## Prioritized recommendations

- **[P1] Add concrete specifics — supported chains, beta limits, counts** — *Maps to: concrete statistics & specifics*
  - **Where:** "Key features" and/or the "ACE Platform" section
  - **Issue:** "the credential is valid across every EVM chain" — no chains named.
  - **Change:** Add a short bulleted or tabular block listing the specific EVM networks ACE supports in Beta, the number of pre-built policy modules in the library, and any Beta rate/quantity limits. Lead with the fact ("ACE Beta supports N networks: …").
  - **Why it lifts GEO:** Quantitative, named specifics are the highest-lift retrieval signal; "every EVM chain" is unquotable and unverifiable to an engine.

- **[P1] Add a "What chains/assets does ACE support?" section** — *Maps to: query/intent coverage*
  - **Where:** after "What is ACE?"
  - **Issue:** No section answers the common "which chains / is X supported?" query.
  - **Change:** Add a question-phrased H2 with a one-sentence answer-first statement and a list, cross-linking `/ace/beta-scope`.
  - **Why it lifts GEO:** Symptom/intent-phrased headings win retrieval that concept prose loses; support questions are among the most common dev queries.

- **[P2] Convert the three managers and two signing models into tables** — *Maps to: machine-scannability & justification structure*
  - **Where:** "ACE Platform" and the "Flexible signing models" bullet
  - **Issue:** Manager roles and delegated-vs-self-signing tradeoffs are prose bullets.
  - **Change:** Add a 3-row table (Manager | Interface | Purpose) and a 2-row table (Signing model | Who signs | When to choose).
  - **Why it lifts GEO:** Tables let engines extract reasons and build justified comparative answers.

- **[P2] Fix malformed `keywords` and template `about` in JSON-LD** — *Maps to: machine-readability & metadata*
  - **Where:** `TechArticle` block
  - **Issue:** `keywords:"…programmable,, cross-chain… contracts."` and `about:[{"name":"Ace","description":"Content about ace"}]`.
  - **Change:** Replace with a clean comma-separated keyword list and meaningful `about` entities (e.g. "Regulatory compliance", "Cross-chain identity", "Smart contract policy enforcement").
  - **Why it lifts GEO:** Malformed metadata and boilerplate entities weaken entity resolution and E-E-A-T parsing.

- **[P2] Resolve the declared-TypeScript vs zero-code mismatch** — *Maps to: code completeness & metadata accuracy*
  - **Where:** `additionalProperty` / `programmingLanguage`
  - **Issue:** `programmingLanguage:"TypeScript"` on a page with 0 code fences.
  - **Change:** Either remove the declaration on this overview, or add one minimal, complete snippet (e.g. a PolicyEngine call or Reporting API query) with imports/config.
  - **Why it lifts GEO:** False structured signals reduce agent trust; a real snippet would also raise runnability.

- **[P3] Add external authoritative references** — *Maps to: citations & authoritative references*
  - **Where:** "Off-chain risk screening" bullet and identity claims
  - **Issue:** TRM, CRE, KYC/AML named with only internal or no links.
  - **Change:** Add inline links to the TRM primary source and any canonical CRE/compliance-standard pages.
  - **Why it lifts GEO:** Primary-source citations raise credibility and citation rate; the page currently has 0 external links.

## Anti-patterns found

- Auto-generated template `about` entries ("Content about ace") and space-tokenized `keywords` with stray punctuation.
- `programmingLanguage: TypeScript` declared with no code present.
- Qualitative universals ("every EVM chain", "sophisticated rulesets") where a concrete list/number belongs.
- No troubleshooting/FAQ or supported-chain section — acceptable for an overview, noted for lifecycle completeness.

## Off-page / out-of-scope notes

- Ensure `/ace` is included in `llms.txt` and the sitemap so it is discoverable as the ACE canonical hub; link into it from sibling `/ace/concepts/*` pages to consolidate authority.
- Freshness signals are healthy (dateModified 2026-07-17); maintain cadence as Beta scope changes.
- Third-party/earned citations for a new product like ACE will be sparse — page-level specifics and metadata are the main levers you control now.
