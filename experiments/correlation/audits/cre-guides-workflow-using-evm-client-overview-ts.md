# GEO Audit — EVM Chain Interactions

**URL:** https://docs.chain.link/cre/guides/workflow/using-evm-client/overview-ts
**Analyzed:** 2026-09-18T14:48:47.457Z
**Content type:** developer documentation / section-overview (hub) page

## GEO Score: 64/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 8 | 12.0 |
| Concrete statistics & specifics | 12 | 3 | 3.6 |
| Citations & authoritative references | 10 | 6 | 6.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 3 | 3.0 |
| Query/intent coverage | 10 | 5 | 5.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **64** |

## Summary

This is a short (180-word) overview/hub page introducing the TypeScript `EVMClient` and routing to sub-guides. Its biggest strength is a crisp, liftable opening definition and clean prose; its biggest weakness is that it carries almost no concrete specifics (zero numerals, no viem version, no code) and no symptom/error-phrased coverage, so it will lose retrieval to task-specific queries. As a landing page the scope is legitimately thin — but even for a hub it under-delivers on version pinning and machine-scannable comparison of the "manual ABI + viem" approach it advocates.

## Dimension analysis

- **Answer-first extractability** — Strong. Opens with a self-contained canonical statement: "The `EVMClient` is the TypeScript SDK's interface for interacting with EVM-compatible blockchains." "How it works" also leads with its answer. No action needed.
- **Structural scannability** — Strong for a hub: 3 headings, 1 H1, 0 level skips, bulleted approach list and guide list. No tables, but none required at this length.
- **Concrete statistics & specifics** — Weak. Measured facts: 0 numerals, 0 units, no version strings. viem is named but not pinned; no chain-selector examples, no supported-network list.
- **Citations & authoritative references** — Adequate. 1 external link (viem.sh) plus internal links to the capability and guide pages. No link to a canonical viem version/API page or EVM spec.
- **Quotable canonical definitions** — Strong. First sentence and the bulleted properties of the "manual ABI" approach are verbatim-liftable.
- **Machine-readability & metadata** — Good. Both JSON-LD blocks (BreadcrumbList, TechArticle) parse; canonical + inLanguage present. Weaknesses: `datePublished`==`dateModified` (never revised/generator-stamped), `keywords` is auto-split stopword-laden, and `about` entries are the generic "Content about evm/chain/interactions" template — weak entity signals.
- **Code completeness & agent-runnability** — Weak. 0 fenced blocks despite the page being about a code SDK and declaring `programmingLanguage: TypeScript`. A single minimal `EVMClient` instantiation snippet would anchor retrieval.
- **Query/intent coverage** — Developing. Covers "what is EVMClient" and "how it works" but no "how do I…" entry snippet, no troubleshooting, no error strings. Symptom-phrased queries route elsewhere.
- **Clarity, fluency & terminology consistency** — Strong. Unambiguous, consistent naming of `EVMClient`, viem, and the SDK. No action needed.

## Prioritized recommendations

- **[P1] Add a minimal, copy-pasteable `EVMClient` snippet** — *Maps to: code completeness, answer-first extractability*
  - **Where:** under "How it works," before the bullet list.
  - **Issue:** page about a code SDK has "0 fenced block(s)."
  - **Change:** add one tagged ```ts``` block showing import, `getNetwork()`, `EVMClient` construction, and a `.result()` read call with expected return shape.
  - **Why it lifts GEO:** a complete runnable snippet is the highest-value liftable unit for coding agents and the natural citation target for "how to use EVMClient in TypeScript."

- **[P1] Add symptom/query-phrased sub-headings or an FAQ line** — *Maps to: query/intent coverage*
  - **Where:** new short section or reframed guide bullets.
  - **Issue:** only concept-titled headings ("How it works", "Guides"); no "how do I read/write" phrasing.
  - **Change:** phrase guide links as questions — e.g. "How do I read onchain state in TypeScript?" → Onchain Read; "How do I write to a contract?" → Onchain Write.
  - **Why it lifts GEO:** devs/agents query by task; question-phrased anchors win retrieval that concept titles lose.

- **[P2] Pin the viem version and name concrete specifics** — *Maps to: concrete statistics & specifics*
  - **Where:** "How it works" bullets.
  - **Issue:** "with [viem]" and "chain selectors" stated without versions or values.
  - **Change:** state the supported/required viem version (e.g. "viem ≥ x.y") and reference one concrete chain selector example.
  - **Why it lifts GEO:** version numbers and concrete parameters are among the highest-lift retrieval signals; they also defend against parametric priors substituting a generic viem pattern.

- **[P2] Name the canonical helpers as a Don't-vs-Do** — *Maps to: parametric-prior resistance*
  - **Where:** bullet "Built-in helpers like `getNetwork()`, `bytesToHex()`, and chain selectors".
  - **Issue:** helpers listed but not distinguished from generic viem equivalents.
  - **Change:** add one line stating the SDK helper is canonical (e.g. "use the SDK's `getNetwork()` — do not hand-construct chain configs").
  - **Why it lifts GEO:** prevents engines from substituting the generic ecosystem idiom when this page is skimmed.

- **[P3] Fix metadata entity/keyword hygiene** — *Maps to: machine-readability & metadata*
  - **Where:** JSON-LD `about` and `keywords`.
  - **Issue:** `about` = "Content about evm/chain/interactions" template; `keywords` split into stopwords ("with", "and").
  - **Change:** replace `about` with real entities (EVMClient, viem, EVM Read & Write Capability); supply a curated keyword list.
  - **Why it lifts GEO:** clean entity metadata improves entity resolution and topical trust (E-E-A-T). Lower priority than retrieval fixes.

- **[P3] Add a genuine last-reviewed signal** — *Maps to: machine-readability & metadata (freshness)*
  - **Where:** `dateModified`.
  - **Issue:** `datePublished`==`dateModified` (2025-11-04) reads as never-revised.
  - **Change:** update `dateModified` on real edits so freshness is credible.
  - **Why it lifts GEO:** visible freshness is a trust signal for generative engines.

## Anti-patterns found

- Auto-generated placeholder schema: `about` entries "Content about evm/chain/interactions" and stopword-laden `keywords` ("with", "and").
- Identical publish/modify dates — stale-looking freshness signal.
- No code blocks on a page documenting a code SDK (thin for the topic, though partly justified by hub scope).

## Off-page / out-of-scope notes

- Consider `llms.txt` at site level to steer agents to canonical CRE/EVMClient pages.
- Ensure the parent `using-evm-client` index links down into this overview and the task guides link back up (canonical-hub pattern) to consolidate retrieval authority.
- Full `<head>` was provided and parsed cleanly — metadata read is complete for this audit.
