# GEO Audit — Supported Networks

**URL:** https://docs.chain.link/data-streams/supported-networks
**Analyzed:** 2026-09-18T14:49:30.145Z
**Content type:** developer documentation / reference (network & contract-address listing)

## GEO Score: 49/100 — Developing

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 5 | 7.5 |
| Structural scannability & chunkability | 15 | 6 | 9.0 |
| Concrete statistics & specifics | 12 | 2 | 2.4 |
| Citations & authoritative references | 10 | 5 | 5.0 |
| Quotable canonical definitions | 8 | 6 | 4.8 |
| Machine-readability & metadata | 12 | 6 | 7.2 |
| Code completeness & agent-runnability | 10 | 3 | 3.0 |
| Query/intent coverage | 10 | 4 | 4.0 |
| Clarity, fluency & terminology consistency | 8 | 8 | 6.4 |
| **Total** | **100** | | **49** |

## Summary

This is a reference page whose entire purpose is to list the blockchain networks and verifier
proxy contract addresses for Chainlink Data Streams — and the primary table renders with
headers but **zero rows**. As served to a crawler or LLM, the page contains 144 words, 0
numerals, and 0 hex identifiers (per Measured facts), meaning the single most valuable payload
(network names + addresses + chain IDs) is absent from the fetchable content. The prose framing
is clean and the schema is well-formed, but an LLM asked "what is the Data Streams verifier
proxy address on Arbitrum?" will retrieve nothing citable here. The headline verdict: fix the
empty table before anything else — no GEO polish matters while the core data is unrenderable to
non-JS consumers.

## Dimension analysis

**Answer-first extractability** — The intro cleanly answers "what is Data Streams" ("provides
data access directly via API or WebSocket for offchain use cases"), and the Streams Trade
section leads with a self-contained list of 7 networks. But the implied primary question — the
verifier network addresses — has an empty answer. Partial.

**Structural scannability** — Clean hierarchy: 1 H1, 2 H2, 0 level skips, sections under 70
words (per facts). Anchored headings aid chunking. The empty table is the weakness, not the
structure itself.

**Concrete statistics & specifics** — Critical gap. 0 numerals, 0 units, 0 hex identifiers in
prose or code (per facts). A supported-networks page with no addresses, chain IDs, or network
counts is the highest-impact deficiency on the page.

**Citations & authoritative references** — 7 internal links to relevant concept pages
(report-schema, Streams Trade, Automation) support entity resolution. No external/primary
sources, but block-explorer links (promised as "Click any verifier proxy address") would be the
natural authoritative refs — and they're missing because the table is empty.

**Quotable canonical definitions** — "Chainlink Data Streams provides data access directly via
API or WebSocket for offchain use cases" is a solid liftable one-liner. Streams Trade is also
crisply defined. Adequate.

**Machine-readability & metadata** — JSON-LD BreadcrumbList + TechArticle both parse; canonical
and og/twitter present. Weak spots: `dateModified` identical to `datePublished` (no freshness
signal for a page that must track new chains), `keywords` is auto-generated noise ("Find, the,
list…" including 3 stopwords), and all 5 `about` entries are the template "Content about X."

**Code completeness & agent-runnability** — No code blocks. For this page type, the agent-usable
artifact is the address table itself (config data); its absence means an agent gets nothing to
paste. Scored on that basis, not on missing snippets.

**Query/intent coverage** — Structure targets the right intents ("supported networks," "verifier
addresses") but cannot answer them with the table empty. No chain-ID column, no per-network
anchors that symptom queries ("Data Streams Base verifier address") could hit.

**Clarity, fluency & terminology consistency** — Strong; no action needed. Consistent naming of
Data Streams / Streams Trade / StreamsLookup; unambiguous prose.

## Prioritized recommendations

- **[P1] Render the Streams Verifier Network Addresses table** — *Maps to: concrete specifics, answer-first*
  - **Where:** `## Streams Verifier Network Addresses`
  - **Issue:** table has `| Network | | Verifier Proxy Address |` header and no rows.
  - **Change:** Populate rows server-side (SSR/static) so each network name, chain ID, and
    verifier proxy hex address is in the fetched HTML — not injected client-side. Add a Chain ID
    column and link each address to its block explorer.
  - **Why it lifts GEO:** LLMs and crawlers that don't execute JS see an empty page today; the
    page's entire retrievable value is this data. Highest-lift change by an order of magnitude.

- **[P1] Add per-network answer-first phrasing for symptom/entity queries** — *Maps to: query coverage, parametric-prior resistance*
  - **Where:** verifier table / new short lead sentence per section
  - **Issue:** no text an engine can lift for "verifier proxy address on {network}".
  - **Change:** Precede the table with a liftable sentence, e.g. "Data Streams verifier proxy
    contracts are deployed on Arbitrum, Avalanche, Base, BNB Chain, Ethereum, Optimism, and
    Polygon; the same verifier address applies across all report types on a given network." Keep
    network names as scannable text, not only table cells.
  - **Why it lifts GEO:** Devs query by network name + "address"; text mentions win retrieval
    that an empty/JS-only table loses.

- **[P2] Fix freshness signaling** — *Maps to: machine-readability & metadata*
  - **Where:** JSON-LD `dateModified` / visible page
  - **Issue:** `dateModified` == `datePublished` (identical — no revision signal).
  - **Change:** Stamp `dateModified` from real content edits and surface a visible "Last
    updated" line. For a network list that changes as chains are added, freshness is a trust
    signal.
  - **Why it lifts GEO:** Visible recency raises E-E-A-T weighting for time-sensitive support
    lists.

- **[P2] Replace auto-generated keywords/about with real entities** — *Maps to: machine-readability & metadata*
  - **Where:** TechArticle `keywords` and `about`
  - **Issue:** `keywords` = "Find, the, list…" (stopwords); `about` = 5× "Content about X".
  - **Change:** Set `about` to real Things (Chainlink Data Streams, Verifier Proxy, Streams
    Trade, supported networks) with meaningful descriptions; drop stopword keywords.
  - **Why it lifts GEO:** Templated noise wastes the structured-metadata channel; clean entities
    aid entity resolution. (Lower priority than the empty table despite being measurable.)

- **[P3] Add a short "How to use these addresses" pointer + expected use** — *Maps to: code completeness, query coverage*
  - **Where:** below the verifier table
  - **Issue:** addresses (once present) have no usage context on-page.
  - **Change:** Add one line linking to the report-verification tutorial with a minimal
    "verify(report, verifierProxyAddress)" reference so agents connect address → call site.
  - **Why it lifts GEO:** Bridges reference data to runnable action, improving agent task
    completion.

## Anti-patterns found

- **Empty content shell:** the primary table renders headers only — the page's core payload is
  missing from served HTML.
- **Stale/undated content signal:** `dateModified` identical to `datePublished`.
- **Auto-generated metadata noise:** stopword-laden `keywords`; templated "Content about X"
  `about` entries.
- No keyword stuffing, marketing fluff, or ambiguous pronouns in the prose — prose quality is
  fine.

## Off-page / out-of-scope notes

- If the address table is populated via client-side JS/CMS, this is a site-level rendering
  decision — ensure SSR/static output so LLM crawlers see the rows.
- Consider an `llms.txt` entry pointing to a machine-readable (JSON/CSV) network+address list;
  a structured endpoint would serve agents better than parsing an HTML table.
- The CLI should confirm whether the empty table reflects the served DOM or a fetch-time
  hydration gap; if hydration, the fix is infrastructure, not content authoring.
