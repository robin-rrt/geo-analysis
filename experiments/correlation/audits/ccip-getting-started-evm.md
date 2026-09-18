# GEO Audit — Get Started with CCIP (EVM)

**URL:** https://docs.chain.link/ccip/getting-started/evm
**Analyzed:** 2026-09-18T14:47:30.094Z
**Content type:** developer documentation / tutorial (HowTo)

## GEO Score: 74/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 7 | 10.5 |
| Structural scannability & chunkability | 15 | 7 | 10.5 |
| Concrete statistics & specifics | 12 | 8 | 9.6 |
| Citations & authoritative references | 10 | 8 | 8.0 |
| Quotable canonical definitions | 8 | 6 | 4.8 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 9 | 9.0 |
| Query/intent coverage | 10 | 7 | 7.0 |
| Clarity, fluency & terminology consistency | 8 | 8 | 6.4 |
| **Total** | **100** | | **74.2** |

## Summary

This is a strong, agent-ready CCIP tutorial: complete runnable contracts and scripts (9 substantive fenced blocks, 0 untagged, imports present), real network addresses and chain selectors, and three parallel framework walkthroughs (Hardhat 3, Foundry, Remix). Its biggest GEO weakness is discoverability by symptom/query: there is no troubleshooting/FAQ section and no crisp, liftable definition of what CCIP *is*, so it will lose retrieval on "how do I send a cross-chain message" and error-string queries that its body text actually answers. A secondary drag is polluted structured metadata (garbage `about` entities, malformed `keywords`) and non-semantic step "headings" that weaken chunk boundaries. Honest verdict: best-in-class tutorial content, held back from Strong by query-coverage and metadata hygiene, not by prose quality.

## Dimension analysis

**Answer-first extractability** — Working: page opens with a self-contained value statement, "Build and run a secure cross-chain messaging workflow between two EVM chains using Chainlink CCIP." Weak: sub-sections ("Initializing the contract", "Sending data") assume prior context and don't lead with a standalone claim; no first-sentence definition of CCIP itself.

**Structural scannability & chunkability** — Working: clean H2/H3 per framework, one comparison table for `sendMessage` args, 41 bullets. Weak: the numbered accordions ("1 Sender code", "2 Set up the contracts") are not semantic headings, and there is 1 level skip; 4 sections exceed 600 words (max 1056), producing large, mixed RAG chunks.

**Concrete statistics & specifics** — Strong: 90 prose numerals, live router/LINK addresses, chain selector `16015286601757825753`, `gasLimit` 200_000, versions v1.6.1 / 0.8.24. Minor: vague quantifiers ("several", "significant") and a confusing quantity conflict (see clarity).

**Citations & authoritative references** — Strong; 97 links, 8 to primary sources (Solidity ABI spec, Remix), dense internal links to v1.6.1 API reference. No action needed.

**Quotable canonical definitions** — Weak: no one-to-two-sentence "CCIP is…" or "A CCIP router is…" definition an engine can lift. Terms like `EVM2AnyMessage`, chain selector, and router are used before being crisply defined.

**Machine-readability & metadata** — Working: valid BreadcrumbList + HowTo/TechArticle JSON-LD, canonical URL, `article:modified_time` 2025-12-25 in head, HowTo steps enumerated. Weak: `about` entities are tokenized title fragments ("Get", "Started", "Ccip", "Evm") and `keywords` contains malformed values ("CCIP,,"); no visible on-page last-updated date.

**Code completeness & agent-runnability** — Strong: full contracts with imports, complete deploy/verify scripts, addresses hardcoded, language-tagged. Flagged identifiers (SPDX, THIS, EXAMPLE…) are comment false-positives. No action needed.

**Query/intent coverage** — Working: full lifecycle (setup → deploy → send → verify) across three toolchains. Weak: no troubleshooting/FAQ and no symptom-phrased headings ("No message received yet", "NotEnoughBalance revert", "message not delivered") despite the answers existing in body/code.

**Clarity, fluency & terminology consistency** — Strong overall; consistent sender/receiver/router naming. Weak: quantity inconsistency — scripts fund the sender with **1 LINK** but the Remix section instructs sending **70 LINK**, with an unexplained "gas spikes on Sepolia" note; an agent reading both paths gets contradictory funding guidance.

## Prioritized recommendations

- **[P1] Add a symptom-phrased troubleshooting section** — *Maps to: symptom-phrased query coverage*
  - **Where:** new H2 before "What's next"
  - **Issue:** verify script prints "No message received yet" but no heading captures that query.
  - **Change:** add "## Troubleshooting" with H3s phrased as errors/symptoms: "No message received yet after 10 minutes", "revert NotEnoughBalance(...)", "ccipReceive not called / onlyRouter", each with a one-line cause + fix.
  - **Why it lifts GEO:** devs/agents query by error string; symptom headings win retrieval that concept prose loses.

- **[P1] Resolve the 1 LINK vs 70 LINK contradiction** — *Maps to: concrete specifics / clarity*
  - **Where:** Remix step 1 vs Hardhat/Foundry funding steps
  - **Issue:** "send `70` LINK" vs scripts "Funding Sender with 1 LINK".
  - **Change:** state one canonical funding amount, and if fees vary, give the actual range/reason ("send ≥N LINK; call `getFee` to size exactly"). Point to `getFee` as the source of truth.
  - **Why it lifts GEO:** conflicting numbers get synthesized into wrong answers; a single quantified rule is liftable and safe.

- **[P2] Add a crisp CCIP definition in the first liftable sentence** — *Maps to: quotable canonical definitions / parametric-prior resistance*
  - **Where:** top of page, under the H1 intro
  - **Issue:** no standalone "What is CCIP" statement.
  - **Change:** add one sentence, e.g. "Chainlink CCIP (Cross-Chain Interoperability Protocol) is a messaging protocol for sending data and tokens between blockchains; a sender contract calls `ccipSend` on a Router and a receiver contract implements `_ccipReceive`."
  - **Why it lifts GEO:** gives engines a verbatim definition and names the canonical API, resisting generic bridge-pattern priors.

- **[P2] Promote step accordions to semantic headings** — *Maps to: structural scannability & chunkability*
  - **Where:** "1 Bootstrap a new Hardhat project", "2 Set up the contracts", etc.
  - **Issue:** step labels render as bold text, not H4s; 1 level skip present.
  - **Change:** mark each step as a real H4 under its framework H3 and fix the skipped level.
  - **Why it lifts GEO:** clean heading hierarchy creates coherent, independently retrievable chunks.

- **[P2] Clean JSON-LD `about` and `keywords`** — *Maps to: machine-readability & metadata*
  - **Where:** HowTo/TechArticle JSON-LD
  - **Issue:** `about` = "Get"/"Started"/"Ccip"/"Evm"; `keywords` contains "CCIP,," and comma artifacts.
  - **Change:** set `about` to real entities (Chainlink CCIP, Cross-chain messaging, EVM, Solidity) and normalize the keyword list.
  - **Why it lifts GEO:** correct entity metadata aids entity resolution and E-E-A-T; tokenized fragments signal low quality.

- **[P3] Surface a visible "Last updated" date on the page** — *Maps to: freshness signals*
  - **Where:** page header/footer
  - **Issue:** `dateModified` exists in JSON-LD/head but is not rendered in body.
  - **Change:** display "Last updated: 2025-12-25" near the title.
  - **Why it lifts GEO:** visible freshness is an independently rewarded trust signal when pages are skimmed.

- **[P3] Add expected terminal output for the send/verify scripts** — *Maps to: code completeness / agent-runnability*
  - **Where:** after `npx hardhat run ...` and `forge script ...` commands
  - **Issue:** scripts log rich output but no expected sample is shown as text (only screenshots for keystore).
  - **Change:** include a short fenced sample of expected console output (message ID line, CCIP Explorer URL).
  - **Why it lifts GEO:** agents verify success against expected output; text beats screenshots for parsing.

## Anti-patterns found

- Vague quantifiers ("several", "various", "significant") in otherwise specific prose — minor.
- Non-semantic step "headings" produce undifferentiated large chunks (4 sections >600 words).
- Polluted structured metadata (`about` fragments, malformed `keywords`).
- Contradictory funding quantity (1 LINK vs 70 LINK) across framework paths.

## Off-page / out-of-scope notes

- Measured facts report JSON-LD `datePublished`/`dateModified` as absent while the served JSON-LD and `<head>` both contain them (2025-05-19 / 2025-12-25) — verify the emitter surfaces dates in the schema block the harness parses.
- Screenshots carry key UI steps (keystore lists, deploy panels); ensure descriptive `alt` text (site-level) so non-image-reading agents retain the instructions.
- Consider a site-level `llms.txt` and internal links from the CCIP concept/overview hub into this getting-started page to improve retrieval ranking against sibling tutorials.
