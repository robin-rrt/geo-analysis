# GEO Audit — LINK Token Contracts

**URL:** https://docs.chain.link/resources/link-token-contracts
**Analyzed:** 2026-09-18T14:49:25.347Z
**Content type:** developer documentation / reference (address registry)

## GEO Score: 77/100 — Strong

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 9 | 13.5 |
| Concrete statistics & specifics | 12 | 9 | 10.8 |
| Citations & authoritative references | 10 | 7 | 7.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 6 | 6.0 |
| Query/intent coverage | 10 | 7 | 7.0 |
| Clarity, fluency & terminology consistency | 8 | 7 | 5.6 |
| **Total** | **100** | | **76.7** |

## Summary

This is a best-in-class reference registry: ~130 networks, each with a uniform per-network table exposing Chain ID, contract address, symbol, and decimals — highly chunkable and extractable, backed by valid `TechArticle` JSON-LD. Its single biggest strength is machine-scannable structure (170 tables, 264 tightly-sized sections, median 41 words). The biggest opportunity is entity/query hardening: inconsistent parameter labels (`Chain ID` vs `CHAIN_ID` vs `ETH_CHAIN_ID`), auto-templated schema metadata, an unrevised timestamp, and no FAQ/verification guidance for the symptom-style queries devs actually type ("what's the LINK address on Base", "why does my LINK transfer fail on OP Sepolia"). Honest verdict: a strong page that loses marginal GEO to metadata polish and query coverage, not to structure or specifics.

## Dimension analysis

**Answer-first extractability** — Strong. Each network section leads directly with the address table; a lifted chunk (e.g. Polygon Mainnet `0xb0897...`, Chain ID `137`) stands alone. Minor: the top-of-page conceptual sections ("Payment Abstraction") don't front the token's canonical facts.

**Structural scannability & chunkability** — Strong; near-exemplary. Uniform H2-per-chain / H3-per-network hierarchy, 0 sections over 600 words. Only defect: 1 level skip (intro `###` sit directly under the H1 with no intervening H2).

**Concrete statistics & specifics** — Strong. 496 hex identifiers, chain IDs, `Decimals` per network, the Juel definition (`1e18`), and the Solana exception (`Decimals: 9`). No action needed.

**Citations & authoritative references** — Adequate. ERC-677 (`github.com/ethereum/EIPs/issues/677`) and the ETH denomination link (`ethereum.org`) are cited; explorer links are authoritative per-network. Only 2 primary-source links across 717 total — the ERC-20 mention is unlinked.

**Quotable canonical definitions** — Strong. "The LINK token is the native digital asset of the Chainlink Network" and the ERC-677 / Juel definitions are crisp and liftable.

**Machine-readability & metadata** — Good but soft. Valid `TechArticle` + `BreadcrumbList`, canonical URL present. Weakened by: `datePublished` == `dateModified` (identical — generator-stamped, no freshness signal); `keywords` include stopwords `for`/`the`; `about` entries are the auto-template "Content about link/token/contracts."

**Code completeness & agent-runnability** — No code blocks. Defensible for an address registry, but a short snippet (add-token / verify-decimals) would help agents act on the data.

**Query/intent coverage** — Covers "what is LINK", payment, staking, cross-chain, and per-network address lookups. Missing: FAQ/troubleshooting, address-verification guidance, and "how to add LINK to my wallet" — common symptom queries.

**Clarity, fluency & terminology consistency** — Clean prose, but entity-resolution noise: `Chainlink Token` vs `ChainLink Token` casing, and three different chain-ID labels (`Chain ID`, `CHAIN_ID`, `ETH_CHAIN_ID`) for the same field.

## Prioritized recommendations

- **[P1] Normalize the chain-ID parameter label across all tables** — *Maps to: machine-readability / terminology consistency*
  - **Where:** every network table (e.g. Kaia `CHAIN_ID`, Mantle/Sonic/Sei/Zircuit `ETH_CHAIN_ID`, most others `Chain ID`)
  - **Issue:** same field labeled `Chain ID`, `CHAIN_ID`, `ETH_CHAIN_ID` inconsistently.
  - **Change:** standardize every row to `Chain ID` (keep the numeric value). Reserve prose notes for genuinely different identifiers (e.g. Solana cluster names, Starknet `SN_MAIN`).
  - **Why it lifts GEO:** one canonical field name lets engines and agents reliably extract chain ID across all ~130 sections instead of parsing three variants.

- **[P1] Add a "How to verify a LINK address / add LINK to your wallet" FAQ section** — *Maps to: symptom-phrased query coverage*
  - **Where:** new H2 after the intro, before the first network.
  - **Issue:** no coverage of "how do I add LINK", "is this the real LINK contract", "which LINK for CCIP".
  - **Change:** 4–6 Q-phrased H3s answering address verification, decimals (18 vs Solana 9), the OP-Sepolia bridged-LINK caveat, and confirming Chain ID before use.
  - **Why it lifts GEO:** captures symptom/how-to retrieval that a pure address table misses even when the fact is present.

- **[P2] Emit a real `dateModified`** — *Maps to: machine-readability & freshness*
  - **Where:** JSON-LD `TechArticle` + a visible "Last updated" line.
  - **Issue:** `datePublished` and `dateModified` are byte-identical.
  - **Change:** stamp `dateModified` from the actual content-change commit and surface it on-page.
  - **Why it lifts GEO:** freshness is an E-E-A-T signal; an address registry that changes as chains are added benefits from a credible recency date.

- **[P2] Replace auto-templated schema `keywords` and `about`** — *Maps to: machine-readability / entity resolution*
  - **Where:** `TechArticle` JSON-LD `keywords` and `about`.
  - **Issue:** `about` = "Content about link/token/contracts"; `keywords` include `for`, `the`.
  - **Change:** set `about` to real entities (Chainlink, LINK token, ERC-677, smart contract addresses) and remove stopword keywords.
  - **Why it lifts GEO:** meaningful entities aid disambiguation; the template strings add no signal.

- **[P2] Add a top-of-page master index / summary anchor table** — *Maps to: answer-first extractability / scannability*
  - **Where:** immediately after the intro.
  - **Issue:** 130+ networks with no consolidated lookup; the page relies on in-page search.
  - **Change:** a compact table (Network → Chain ID → Mainnet address → anchor link) for the highest-traffic chains (Ethereum, Base, Arbitrum, Polygon, OP, BNB, Avalanche), or an alphabetical anchor list.
  - **Why it lifts GEO:** a single liftable summary table is a high-value retrieval target and defends against the model answering from priors.

- **[P3] Fix `Chainlink` vs `ChainLink` casing in `Name` values** — *Maps to: terminology consistency*
  - **Where:** Astar, Berachain Bartio, Mantle, M-prefixed rows show `ChainLink Token`.
  - **Issue:** inconsistent product-name casing.
  - **Change:** standardize to `Chainlink Token`.
  - **Why it lifts GEO:** consistent product naming aids entity resolution.

- **[P3] Add one short integration snippet** — *Maps to: code completeness / agent-runnability*
  - **Where:** near the token-standard section.
  - **Issue:** 0 code blocks; agents get raw addresses but no usage pattern.
  - **Change:** a tagged snippet showing the ERC-677/20 `IERC20`/`transferAndCall` interface or an `addToken` wallet call, with imports.
  - **Why it lifts GEO:** copy-pasteable, network-labeled code raises agent-runnability without bloating the registry.

## Anti-patterns found

- Stale/undated content signal: identical publish/modify timestamps.
- Auto-generated schema boilerplate (`about` = "Content about X"; stopword `keywords`).
- Minor entity inconsistency: `ChainLink`/`Chainlink` casing and three chain-ID field labels.
- A few malformed explorer URLs with double slashes (e.g. Monad, Merlin testnet, Unichain) — cosmetic, low impact.
- No keyword stuffing, no marketing fluff, no unresolved cross-references — clean.

## Off-page / out-of-scope notes

- Consider an `llms.txt` / structured address feed (JSON) so agents can consume the registry without HTML-table parsing — site-level, not fixable on this page.
- Per-network explorer links depend on third-party uptime; broken/renamed explorers are an off-page maintenance concern.
- CLI should pass raw `<head>` (already provided here) so metadata freshness can be re-verified on each crawl.
