# GEO Audit — Price Feed Contract Addresses

**URL:** https://documentation-git-vrf-migration-guide-chainlinklabs.vercel.app/data-feeds/price-feeds/addresses
**Analyzed:** 2026-07-24T18:37:23.465Z
**Content type:** developer documentation / reference (contract address registry)

## GEO Score: 37/100 — Poor

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 2 | 3.0 |
| Structural scannability & chunkability | 15 | 4 | 6.0 |
| Concrete statistics & specifics | 12 | 2 | 2.4 |
| Citations & authoritative references | 10 | 5 | 5.0 |
| Quotable canonical definitions | 8 | 3 | 2.4 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 2 | 2.0 |
| Query/intent coverage | 10 | 3 | 3.0 |
| Clarity, fluency & terminology consistency | 8 | 6 | 4.8 |
| **Total** | **100** | | **37.0** |

## Summary

This is a high-value reference page — the canonical registry of Chainlink Price Feed contract addresses per network — but the actual addresses render client-side and appear only as `Loading...` in the served content. The page's single biggest strength is its metadata layer (canonical URL, `TechArticle` + `BreadcrumbList` JSON-LD, OG/Twitter tags). Its single biggest and disqualifying weakness is that the core payload (addresses, asset pairs, decimals, feed categories) is invisible to any engine or agent that reads the static DOM, so the page cannot be cited for the very fact it exists to provide. Verdict: strong shell, empty body — retrieval will surface this URL but generative engines will fall back to parametric priors (stale/hallucinated addresses), which for on-chain addresses is a safety hazard, not a minor gap.

## Dimension analysis

- **Answer-first extractability:** Weak. The implied question ("what is the ETH/USD feed address on Ethereum Mainnet?") has no answer in static text — only `Loading...`. A lifted chunk contains no address.
- **Structural scannability:** Partial. Clean H2/H3 hierarchy (`Networks` → `Ethereum Mainnet` → `Data Feed Best Practices`), but the data tables that should be the chunkable units are not present in the served markup.
- **Concrete statistics & specifics:** Very weak. A page whose entire purpose is concrete (addresses, decimals, heartbeat, deviation thresholds) exposes zero of them statically.
- **Citations & authoritative references:** Reasonable internal linking to `selecting-data-feeds`, `using-data-feeds`, LINK token contracts, and SVR feeds. No external/primary-source links, but appropriate for a registry page.
- **Quotable canonical definitions:** Thin. Only the SVR tooltip carries a definition; no crisp liftable statement of what a Price Feed address represents.
- **Machine-readability & metadata:** Strong; canonical points correctly to `docs.chain.link`, valid `TechArticle`/`BreadcrumbList`, `dateModified` present. Deductions: `keywords` is a comma-split stuffed string and `about[]` entities are generic placeholders ("Content about price").
- **Code completeness & agent-runnability:** Weak. No snippet showing how to consume an address via `AggregatorV3Interface.latestRoundData()` — a natural companion for agents landing here.
- **Query/intent coverage:** Weak in practice. The page targets high-intent queries ("Chainlink BTC/USD feed address on Arbitrum") but the answers are not in retrievable text; symptom/lookup phrasing is unaddressed statically.
- **Clarity, fluency & terminology consistency:** Good for what exists; consistent product naming.

## Prioritized recommendations

- **[P1] Server-render the address tables (or provide a static fallback)** — *Maps to: answer-first extractability; concrete specifics; machine-readability*
  - **Where:** `## Networks` → `### Ethereum Mainnet` and every network section (currently renders `Loading...`).
  - **Issue:** `"Loading..."` — the entire payload is client-side only.
  - **Change:** SSR/SSG the feed tables so each row (pair, proxy address, asset type, decimals, feed category) is present in the initial HTML; at minimum emit a `<noscript>` static table or an inline JSON-LD `Dataset`/`ItemList` of address rows.
  - **Why it lifts GEO:** Engines and coding agents parse static DOM; addresses absent from HTML cannot be cited, forcing parametric-prior fallback that yields wrong/stale on-chain addresses — the highest-severity failure for this page type.

- **[P1] Emit addresses as structured data (JSON-LD `ItemList`/`Dataset`)** — *Maps to: machine-readability; agent-runnability*
  - **Where:** page `<head>` alongside existing `TechArticle`.
  - **Issue:** No machine-readable representation of the address set exists.
  - **Change:** Add an `ItemList` per network mapping `name` (e.g. "ETH/USD") → `identifier` (proxy address) → `additionalProperty` (network, decimals, category).
  - **Why it lifts GEO:** Gives agents a deterministic, parse-safe source of truth even when the rendered table is JS-gated.

- **[P2] Add an answer-first lead sentence with a concrete example** — *Maps to: quotable canonical definitions; answer-first*
  - **Where:** directly under `# Price Feed Contract Addresses`.
  - **Issue:** Page opens with navigation links, not an answer.
  - **Change:** Add: "Chainlink Price Feeds are read via a per-network proxy contract address (e.g. ETH/USD on Ethereum Mainnet: `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`). Use the address with `AggregatorV3Interface`." Include a canonical, current example verbatim.
  - **Why it lifts GEO:** Provides a liftable, self-contained fact even if the dynamic table fails to render or index.

- **[P2] Add a minimal consumption code snippet** — *Maps to: code completeness & agent-runnability*
  - **Where:** near the top or under a new `### Reading a feed by address`.
  - **Issue:** No code showing how an address is used.
  - **Change:** Add a complete Solidity snippet with import, `AggregatorV3Interface` init from a real proxy address, and `latestRoundData()` call, plus expected return shape.
  - **Why it lifts GEO:** Agents landing on the address page frequently need the read pattern; a runnable snippet earns citation and prevents API-shape hallucination.

- **[P2] Add symptom/lookup-phrased headings** — *Maps to: query/intent coverage*
  - **Where:** section headings.
  - **Issue:** Headings are concept-titled ("Networks"), not query-shaped.
  - **Change:** Add H3s like "How do I find the ETH/USD price feed address?" and "Which networks have Chainlink Price Feeds?" with one-line answers.
  - **Why it lifts GEO:** Matches how devs/agents query; wins retrieval that concept titles miss.

- **[P3] Clean the JSON-LD `keywords` and `about[]` fields** — *Maps to: machine-readability; anti-pattern*
  - **Where:** `TechArticle` JSON-LD.
  - **Issue:** `"keywords":"list, Price, Feed, addresses, supported, networks."` and placeholder `about` entities ("Content about price").
  - **Change:** Replace with meaningful entity references (e.g. `Chainlink Data Feeds`, `AggregatorV3Interface`, specific networks) or remove the placeholders.
  - **Why it lifts GEO:** Fragmented/placeholder metadata reads as low-quality entity signal; precise entities aid resolution.

- **[P3] Surface a visible "Last updated" date** — *Maps to: machine-readability / freshness*
  - **Where:** page header.
  - **Issue:** Freshness lives only in JSON-LD `dateModified`; not visible in body.
  - **Change:** Render a visible "Last updated: 2026-07-23" line.
  - **Why it lifts GEO:** Visible freshness signals raise trust for a registry page where staleness is a real risk.

## Anti-patterns found

- **Wall of `Loading...` in place of content** — the primary payload is not in served HTML.
- **Keyword-stuffed `keywords` field** in JSON-LD (comma-split single words).
- **Placeholder entity descriptions** ("Content about price / feed / contract") add no signal.

## Off-page / out-of-scope notes

- Canonical correctly points to production `docs.chain.link`; ensure the Vercel preview host is `noindex` to avoid duplicate-URL dilution (this preview is `index, follow`).
- Site-level: confirm `llms.txt` and sitemap list the canonical addresses URL; a machine-readable address dataset endpoint (JSON/CSV) would let agents bypass the JS-render problem entirely.
- CLI note: raw `<head>` was provided and read; dynamic table contents could not be verified because they load client-side — a rendered-DOM capture would confirm what indexers actually see.
