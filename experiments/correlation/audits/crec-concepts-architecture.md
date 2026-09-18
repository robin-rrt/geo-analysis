# GEO Audit — CRE Connect Architecture

**URL:** https://docs.chain.link/crec/concepts/architecture
**Analyzed:** 2026-09-18T14:46:39.445Z
**Content type:** developer documentation / concept-architecture reference

## GEO Score: 73/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 9 | 13.5 |
| Structural scannability & chunkability | 15 | 9 | 13.5 |
| Concrete statistics & specifics | 12 | 6 | 7.2 |
| Citations & authoritative references | 10 | 5 | 5.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 6 | 7.2 |
| Code completeness & agent-runnability | 10 | 6 | 6.0 |
| Query/intent coverage | 10 | 7 | 7.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **73.0** |

## Summary

This is a well-structured concept page that opens with a crisp, liftable definition of CRE Connect and maintains consistent terminology and clean section chunking throughout. Its biggest GEO strength is answer-first extractability — nearly every section leads with a self-contained claim an engine can quote. Its biggest opportunity is authoritative citation and metadata hygiene: zero links to primary specs (EIP-712, ERC-4337, OCR) despite naming them, and a JSON-LD `programmingLanguage` that declares TypeScript/"JavaScript Runtime" on a page whose only SDK is Go — a factual mismatch that invites agents to hallucinate the wrong language.

## Dimension analysis

1. **Answer-first extractability** — Strong; no action needed. Opens with "CRE Connect (CREC) gives applications one API and one Go SDK for three chain-facing tasks" and each section leads with its answer.
2. **Structural scannability** — Strong; 8 sections, 0 level skips, median 112 words, 2 tables, none over 600 words. Clean RAG chunk boundaries.
3. **Concrete statistics & specifics** — Weak. Only 6 prose numerals, 0 with units; "configured confidence level" and "a supported chain" are unquantified. Missing: which chains, what confidence thresholds, any latency/limit numbers.
4. **Citations & authoritative references** — Weak. 33 links but only 1 external and 0 to primary sources; EIP-712, ERC-4337, OCR, and EIP-712 domains are named without linking their specs.
5. **Quotable canonical definitions** — Strong. "The Smart Account is **not an ERC-4337 account**. It is a Chainlink-native contract…" is exactly the kind of verbatim-liftable disambiguation engines reward.
6. **Machine-readability & metadata** — Mixed. Valid TechArticle + BreadcrumbList JSON-LD, canonical, published/modified dates all present, but `programmingLanguage: TypeScript` and `Programming Model: JavaScript Runtime` contradict the Go-only code; `keywords` and `about` are auto-generated boilerplate ("Content about cre").
7. **Code completeness & agent-runnability** — Mixed. The single Go snippet is substantive but shows no imports (`crec`, `os` unresolved); no expected output. Acceptable count for a concept page but not copy-runnable.
8. **Query/intent coverage** — Good. Question-phrased headings ("How operations, events, and queries work") aid retrieval; no troubleshooting/error coverage, appropriate for a concept page but limits symptom-query capture.
9. **Clarity, fluency & terminology consistency** — Strong; no action needed. Consistent entity naming (CRE Connect, DON, Smart Account, Operation) aids entity resolution.

## Prioritized recommendations

- **[P1] Fix the schema language mismatch that misdirects agents** — *Maps to: machine-readability & parametric-prior resistance*
  - **Where:** JSON-LD `additionalProperty` / `programmingLanguage`
  - **Issue:** `"Programming Language","value":"TypeScript"` and `"Programming Model","value":"JavaScript Runtime"`
  - **Change:** Set primary `programmingLanguage` to `Go`, drop the "JavaScript Runtime" programming-model property (the page describes a Go SDK + REST API only).
  - **Why it lifts GEO:** Measured mismatch (declared TypeScript vs 1 Go fence). When retrieval is thin, agents lean on metadata; a wrong language field seeds "use the TypeScript SDK" hallucinations.

- **[P1] Add primary-source links for named standards** — *Maps to: citations & authoritative references*
  - **Where:** "Smart Accounts on-chain" and the Events bullet
  - **Issue:** "EIP-712 signature", "not an ERC-4337 account", "OCR proofs" named with no external link.
  - **Change:** Inline-link EIP-712 (eips.ethereum.org/EIPS/eip-712), ERC-4337, and an OCR/Chainlink whitepaper reference at first use.
  - **Why it lifts GEO:** 0 primary-source links today; inline authoritative citations measurably raise citation rate and credibility.

- **[P2] Add imports to the Go snippet** — *Maps to: code completeness & agent-runnability*
  - **Where:** `crec.NewClient(...)` block
  - **Issue:** Block shows none of the imports it needs (`crec`, `os`).
  - **Change:** Prepend an `import ( "os" ; "github.com/smartcontractkit/…/crec" )` header with the real module path.
  - **Why it lifts GEO:** Measured: the only import-needing block shows none; agents copy-paste snippets and fail without the package path.

- **[P2] Quantify the vague qualifiers** — *Maps to: concrete statistics & specifics*
  - **Where:** "supported chain" (table) and "configured confidence level"
  - **Issue:** No numbers — "when a matching log reaches the configured confidence level".
  - **Change:** Name the supported chains (or link a canonical list) and state the confidence options (e.g. `confirmed_latest` vs `confirmed_safe` block depths).
  - **Why it lifts GEO:** Only 7 numerals/1k words, 0 with units; concrete specifics are among the highest-lift changes.

- **[P3] Replace auto-generated keywords and `about` boilerplate** — *Maps to: machine-readability & metadata*
  - **Where:** JSON-LD `keywords` and `about`
  - **Issue:** `"about":[{"name":"Cre","description":"Content about cre"}]` and keyword tokens like `"Connect:"`, `"queries."`.
  - **Change:** Curate real entities (CRE Connect, Chainlink DON, Smart Account, EIP-712, Chain Query) and drop punctuation-fragment/stopword tokens.
  - **Why it lifts GEO:** Templated `about` and stopword-laden keywords add no entity signal and weaken E-E-A-T parsing.

- **[P3] Add a one-line supported-chains / limits note or FAQ stub** — *Maps to: query/intent coverage*
  - **Where:** after "How operations, events, and queries work"
  - **Issue:** No coverage of "which chains does CRE Connect support" — a common first query.
  - **Change:** Add a short "Supported networks" line or link, phrased as the question devs ask.
  - **Why it lifts GEO:** Captures symptom/intent queries the current concept-titled prose misses.

## Anti-patterns found

- Auto-generated `about` entries ("Content about cre/connect/architecture") and stopword-laden `keywords` (`how`, `the`, `and`; fragments `Connect:`, `queries.`).
- Schema/code language mismatch (TypeScript declared, Go served).
- Single code block ships without imports.

## Off-page / out-of-scope notes

- Consider an `llms.txt` at site root to guide agent crawling of the `/crec` concept hub (site-level, not this page).
- The auto-generated JSON-LD `keywords`/`about` templating appears site-wide — worth fixing in the doc pipeline, not just here.
- Freshness signals are healthy (dateModified 2026-08-31); maintain the cadence as the SDK surface evolves.
