# GEO Audit — Fund Your Contracts

**URL:** https://docs.chain.link/resources/fund-your-contract
**Analyzed:** 2026-09-18T14:45:29.129Z
**Content type:** developer documentation / procedural how-to guide

## GEO Score: 56/100 — Developing

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 6 | 9.0 |
| Structural scannability & chunkability | 15 | 7 | 10.5 |
| Concrete statistics & specifics | 12 | 3 | 3.6 |
| Citations & authoritative references | 10 | 4 | 4.0 |
| Quotable canonical definitions | 8 | 5 | 4.0 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 5 | 5.0 |
| Query/intent coverage | 10 | 5 | 5.0 |
| Clarity, fluency & terminology consistency | 8 | 8 | 6.4 |
| **Total** | **100** | | **55.9** |

## Summary

This is a short (216-word), cleanly written procedural guide for funding a deployed Solidity contract with LINK or ETH via Remix and MetaMask. Its biggest strength is clarity and clean structure; its biggest weakness is a near-total absence of concrete specifics (no funding amounts, no LINK token addresses, no network list, no gas guidance) and no symptom/query-phrased coverage — meaning it answers "how do I fund" but not "why did my funding transaction fail" or "how much LINK does my contract need." The honest verdict: a solid but thin walkthrough that will lose retrieval to richer sibling pages unless it adds concrete parameters and question-phrased sections.

## Dimension analysis

**Answer-first extractability** — The intro is a decent self-contained lead ("Some smart contracts require funding at their addresses so they can operate without you having to call functions manually"). Weak point: it opens with the vague "Some smart contracts" rather than a crisp canonical statement of when and how much to fund.

**Structural scannability** — Strong for its size: 1 H1, 2 H2s, 0 level skips, numbered step lists per section (measured: 3 sections, 0 over 600 words). Chunk boundaries are clean. No table, but the content doesn't demand one.

**Concrete statistics & specifics** — Weak. Measured: 14 numerals, 0 with units, 0 hex identifiers. No LINK/token contract addresses, no example funding amount, no gas cost figures, no list of supported networks beyond a passing "Sepolia." This is the largest single scoring loss.

**Citations & authoritative references** — 5 internal links, 0 external (measured). Links to `/resources/acquire-link` are useful, but there is no link to the canonical LINK token contract addresses page or MetaMask/Remix docs.

**Quotable canonical definitions** — The opening sentence is liftable but qualitative. There is no crisp definition of *what "funding a contract" means* or *which contracts need it* that an engine can quote verbatim.

**Machine-readability & metadata** — Good scaffolding: valid `TechArticle` + `BreadcrumbList` JSON-LD, canonical URL, `inLanguage`, 12 og / 9 twitter tags. Two defects: `datePublished` and `dateModified` are identical (no genuine freshness signal), and the `about` entries are auto-generated garbage — "Content about fund", "Content about your", "Content about contracts" (the title tokenized into words), which pollutes the entity graph.

**Code completeness & agent-runnability** — 0 code blocks (measured). Largely acceptable for a GUI-driven guide, but a copy-pasteable snippet for programmatic funding (e.g., `transfer` on the LINK ERC-677 token) and the actual token addresses would materially help agents.

**Query/intent coverage** — Covers the happy-path "how to fund." Missing: "how much LINK does a VRF/Automation contract need," "my funding transaction failed," mainnet vs testnet, and programmatic funding. No troubleshooting or FAQ.

**Clarity, fluency & terminology consistency** — Strong; no action needed. Prose is unambiguous and terminology is consistent.

## Prioritized recommendations

- **[P1] Add concrete specifics: token addresses, amounts, networks** — *Maps to: concrete statistics & specifics*
  - **Where:** "Send funds to your contract" step 5–6
  - **Issue:** "enter the amount of LINK that you want to send" — no figures, no addresses
  - **Change:** Add a short table of LINK token contract addresses per network (Ethereum mainnet, Sepolia, Arbitrum, Base, etc.) with a note that MetaMask needs the token imported by address, and give a concrete example amount (e.g., "VRF v2.5 subscriptions typically need 5–10 LINK"). Link to the canonical LINK token addresses page.
  - **Why it lifts GEO:** Quantitative claims and network/address specifics are among the highest-lift retrieval signals; qualitative-only prose underperforms.

- **[P1] Add symptom/question-phrased sections** — *Maps to: query/intent coverage + symptom-phrased query coverage*
  - **Where:** new H2 sections at end of page
  - **Issue:** page answers only "how to fund," not the failure/quantity questions devs actually type
  - **Change:** Add sections titled "How much LINK should I send to my contract?", "My contract funding transaction failed or LINK isn't showing up", and "How do I fund a contract programmatically?" Each opens with a one-sentence direct answer.
  - **Why it lifts GEO:** Devs and agents query by symptom and "how much/how do I"; question-titled sections win retrieval that concept prose loses.

- **[P2] Lead with a crisp canonical statement** — *Maps to: answer-first extractability + quotable definitions*
  - **Where:** intro paragraph, first sentence
  - **Issue:** "Some smart contracts require funding at their addresses…"
  - **Change:** Replace with a self-contained definition, e.g., "Funding a contract means sending LINK or ETH directly to its deployed address so it can pay for automated operations (e.g., VRF requests or Automation upkeeps) without manual per-call transactions."
  - **Why it lifts GEO:** A crisp, verbatim-liftable opening outperforms diffuse "some contracts" phrasing and resists parametric-prior substitution.

- **[P2] Fix `about` schema entities** — *Maps to: machine-readability & metadata*
  - **Where:** `TechArticle` JSON-LD `about` array
  - **Issue:** `{"name":"Fund","description":"Content about fund"}`, `"Your"`, `"Contracts"` — title tokenized into non-entities
  - **Change:** Replace with real entities: e.g., `LINK Token`, `Smart Contract Funding`, `MetaMask`, `Remix IDE`, each with a genuine description.
  - **Why it lifts GEO:** Auto-generated pseudo-entities dilute entity resolution; correct `about` terms strengthen topical grounding.

- **[P2] Emit a real `dateModified`** — *Maps to: machine-readability & metadata (freshness)*
  - **Where:** JSON-LD `datePublished`/`dateModified`
  - **Issue:** both timestamps identical (2026-09-18T02:47:37.849Z) — reads as generator-stamped, no revision signal
  - **Change:** Populate `dateModified` from the actual last content edit in the CMS/build pipeline.
  - **Why it lifts GEO:** Visible freshness is an E-E-A-T signal engines weight when ranking sources.

- **[P3] Add a programmatic-funding code snippet** — *Maps to: code completeness & agent-runnability*
  - **Where:** new "Fund a contract programmatically" section
  - **Issue:** 0 code blocks; guide is GUI-only
  - **Change:** Add a labeled, copy-pasteable snippet (with imports and the LINK ERC-677 token address) showing a `transfer`/`transferAndCall` funding call, or an `ethers.js` ETH transfer.
  - **Why it lifts GEO:** Complete, runnable snippets are directly usable by coding agents and raise citation likelihood.

## Anti-patterns found

- Auto-generated `about` schema entities ("Content about fund", "Content about your", "Content about contracts") — meaningless to entity resolution.
- Vague quantifier in the lead ("Some smart contracts require funding…") with no accompanying specifics.
- Identical publish/modify timestamps — no genuine freshness signal.
- No stale-content or broken-reference issues; prose is clean.

## Off-page / out-of-scope notes

- Site-level `llms.txt` and sitemap coverage should ensure this thin page is linked from richer canonical hubs (VRF, Automation funding docs) so it isn't outranked by them for funding queries.
- Screenshots (`metamask.png`, Remix screenshot) carry no alt text in the rendered content — a site-level accessibility/parse concern beyond this page's copy.
- The CLI should pass raw `<head>` (provided here) — metadata was verifiable; no assumption needed.
