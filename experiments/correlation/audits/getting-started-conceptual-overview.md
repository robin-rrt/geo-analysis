# GEO Audit — Smart Contract Overview

**URL:** https://docs.chain.link/getting-started/conceptual-overview
**Analyzed:** 2026-09-18T14:47:25.666Z
**Content type:** developer documentation / conceptual tutorial (beginner onboarding)

## GEO Score: 73/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 8 | 12.0 |
| Concrete statistics & specifics | 12 | 5 | 6.0 |
| Citations & authoritative references | 10 | 8 | 8.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 6 | 7.2 |
| Code completeness & agent-runnability | 10 | 7 | 7.0 |
| Query/intent coverage | 10 | 8 | 8.0 |
| Clarity, fluency & terminology consistency | 8 | 8 | 6.4 |
| **Total** | **100** | | **73.0** |

## Summary

This is a well-structured beginner conceptual page whose greatest GEO strength is that its section headings are phrased as the literal questions developers ask ("What is a smart contract?", "What does 'deploying' mean?", "What is MetaMask?") — near-ideal for symptom/query retrieval. Each section also opens with a crisp, liftable definition. The biggest opportunity is metadata hygiene: the served JSON-LD carries auto-generated, partly *incorrect* entity data (declares the language as "TypeScript"/"JavaScript Runtime" when all 7 code fences are Solidity; `teaches: "How to conceptual overview"`; placeholder `about` entries). Honest verdict: strong bones, held back from the Strong band by thin concrete specifics and machine-metadata that misdescribes the page's own subject.

## Dimension analysis

- **Answer-first extractability** — Strong. Sections lead with self-contained definitions ("a *smart contract* is a set of instructions that can be executed without intervention from third parties"). No "as above" dependencies.
- **Structural scannability & chunkability** — Strong. 17 headings, 1 H1, 0 level skips, median 97 words/section, none over 600 (measured). Only gap: 0 tables — a page this comparison-friendly (Solidity vs other languages, ERC20 vs ERC677, Remix vs MetaMask roles) could extract better with one.
- **Concrete statistics & specifics** — Weak. Only 4 prose numerals, 0 with units, and vague quantifiers "many, some, most" present (measured). Conceptual pages need fewer numbers, but claims like ERC677/ERC20 mechanics and oracle aggregation invite specifics.
- **Citations & authoritative references** — Strong. 10 links to primary sources (ethereum.org, soliditylang.org, remix, github). Deduct only for 3 opaque link texts ("here"/"this").
- **Quotable canonical definitions** — Strong; no action needed. Deploying, oracles, LINK token, hybrid smart contract each get a one-sentence liftable definition.
- **Machine-readability & metadata** — Mixed. Valid BreadcrumbList + HowTo/TechArticle, canonical URL, rich OG/Twitter tags. But `additionalProperty` declares Programming Language "TypeScript" (page is 100% Solidity), `teaches` is garbage, `keywords` includes stopword "and", and `about` uses placeholder "Content about conceptual/overview" — these mislead entity resolution.
- **Code completeness & agent-runnability** — Good. All 7 fences tagged solidity, full examples carry SPDX + pragma. 4 of 6 blocks are intentional fragments without imports (measured); acceptable as inline illustrations. No expected output shown.
- **Query/intent coverage** — Strong. Question-form headings match real dev phrasing across the setup→concept→tools lifecycle. Missing: any error/troubleshooting angle (acceptable for a pure overview).
- **Clarity, fluency & terminology consistency** — Strong. Consistent naming (Solidity, LINK, Chainlink, Remix, MetaMask). Minor typo in meta description: "what smart contracts are and, how to write them".

## Prioritized recommendations

- **[P1] Fix incorrect/auto-generated JSON-LD entity fields** — *Maps to: machine-readability & metadata; parametric-prior/entity resolution*
  - **Where:** HowTo/TechArticle JSON-LD block — `additionalProperty`, `teaches`, `about`, `keywords`
  - **Issue:** `"Programming Language","value":"TypeScript"` and `teaches:"How to conceptual overview"`
  - **Change:** Set programmingLanguage to `Solidity`; replace `teaches` with a real string ("Smart contract and oracle fundamentals for Solidity developers"); replace placeholder `about` entries with real Things (Smart Contract, Solidity, Oracle, LINK Token); drop the "and" keyword.
  - **Why it lifts GEO:** Misdeclared language actively teaches engines the wrong entity for this page; correcting it prevents mis-synthesis and strengthens E-E-A-T signals.

- **[P1] Surface a visible last-updated date** — *Maps to: freshness signals / machine-readability*
  - **Where:** page header/footer and served metadata (measured: visible datePublished/dateModified absent)
  - **Issue:** No human-visible freshness signal; JSON-LD dates are the only ones and are future-stamped.
  - **Change:** Render a "Last updated: YYYY-MM-DD" line and ensure it matches the JSON-LD `dateModified`.
  - **Why it lifts GEO:** Visible freshness raises trust/citation likelihood; conflicting/absent dates weaken it.

- **[P2] Add a concept-summary table** — *Maps to: machine-scannability & justification structure*
  - **Where:** near top, or within "How do smart contracts use oracles?"
  - **Issue:** 0 tables on a page full of comparable concepts (measured).
  - **Change:** Add a small table: Term | One-line definition | Chainlink product/link (Data Feeds, VRF, Automation, Any API). Also consider ERC20 vs ERC677 rows in the LINK section.
  - **Why it lifts GEO:** Tables give engines clean extract-and-cite units and let them build justified multi-item answers.

- **[P2] Replace vague quantifiers with specifics** — *Maps to: concrete statistics & specifics*
  - **Where:** "What is a LINK token?" and "How do smart contracts use oracles?"
  - **Issue:** "aggregated from many independent Chainlink node operators"; "most popularly used"
  - **Change:** State the concrete mechanic — e.g. LINK is an ERC677 token (18 decimals) used to pay node operators; name the ERC standard numbers inline; where accurate, cite that Data Feeds aggregate reports from multiple independent operators via OCR.
  - **Why it lifts GEO:** Quantitative/standard-numbered claims are among the highest-lift changes for citation.

- **[P2] Replace opaque link text** — *Maps to: citations & authoritative references*
  - **Where:** "Solidity versions" ("see the latest versions … here"), "Variables" ("visibility [here]"), "Functions" ("visibility [here]")
  - **Issue:** 3 links with text "here"/"this" (measured).
  - **Change:** Use descriptive anchors: "Solidity compiler release list", "state-variable visibility (Solidity docs)", "function visibility (Solidity docs)".
  - **Why it lifts GEO:** Descriptive anchors help engines attribute claims and improve link-context parsing.

- **[P3] Label code fragments and add a runnable note** — *Maps to: code completeness & agent-runnability*
  - **Where:** Variables/Constructors/Functions fragment blocks
  - **Issue:** 4 of 6 blocks show no imports/pragma (measured); acceptable but ambiguous to an agent.
  - **Change:** Add a one-line caption marking these as "excerpt — see full HelloWorld above" so agents don't treat fragments as compilable files.
  - **Why it lifts GEO:** Prevents agents copying an un-compilable fragment as a complete contract.

## Anti-patterns found

- Auto-generated placeholder metadata: `about` → "Content about conceptual/overview"; `teaches` → "How to conceptual overview"; wrong programmingLanguage.
- Vague quantifiers in prose: "many", "some", "most" (measured).
- 3 opaque link anchors ("here"/"this").
- Minor typo in meta description ("are and, how to write them").
- No keyword stuffing, no marketing fluff, no unresolved cross-references — good.

## Off-page / out-of-scope notes

- Consider `llms.txt` at site root to steer agent crawling toward canonical getting-started pages.
- Future-dated JSON-LD (`2026-09-18`) is likely a build-pipeline artifact; verify the site-wide date generator emits real publish/modified dates.
- This overview is a natural canonical hub for "what is a smart contract / oracle" queries — internal links *into* it from Data Feeds, VRF, and Automation intros would reinforce its authority (site-level).
