# GEO Audit — Migrate from Chainlink VRF to Chainlink CRE

**URL:** https://documentation-git-vrf-migration-guide-chainlinklabs.vercel.app/cre/reference/vrf-migration-ts
**Analyzed:** 2026-07-24T18:25:56.622Z
**Content type:** developer documentation / migration reference

## GEO Score: 75/100 — Strong

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 9 | 13.5 |
| Concrete statistics & specifics | 12 | 6 | 7.2 |
| Citations & authoritative references | 10 | 7 | 7.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 6 | 6.0 |
| Query/intent coverage | 10 | 7 | 7.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **74.7** |

## Summary

This is a well-structured migration reference that maps VRF concepts to CRE workflows with a strong terminology table, explicit security do/avoid lists, and answer-first section leads. Its single biggest strength is scannability and canonical concept mapping; its biggest opportunity is defending against a dangerous parametric prior — the page's canonical randomness API is `Math.random()`, which models overwhelmingly associate with insecure JavaScript PRNG behavior, and an unretrieved or skimmed answer could actively warn developers away from the correct pattern. Metadata accuracy (auto-generated JSON-LD garbage and a wrong language tag) and symptom-phrased query coverage are the other actionable gaps.

## Dimension analysis

- **Answer-first extractability:** Strong. Sections open with liftable claims: "CRE randomness is **consensus-derived**," "This is the biggest structural change." Minor weak point — the intro leads with a comparison rather than a one-sentence definition of what the migration entails.
- **Structural scannability & chunkability:** Strong; no action needed. Clear H2/H3 hierarchy, a clean VRF→CRE mapping table, and bulleted security Do/Avoid blocks are ideal RAG chunks.
- **Concrete statistics & specifics:** Adequate but thin. Real specifics exist (`gasLimit: "300000"`, `*/5 * * * *`, `Math.random()` range `[0,1)`) but no SDK version, no DON size/threshold number for "Byzantine-fault-tolerant supermajority," no latency or finality figures.
- **Citations & authoritative references:** Good internal linking to key-terms and guides, but claims like "ECVRF proof" and "Byzantine-fault-tolerant supermajority" lack external links to primary sources (VRF spec, BFT definition).
- **Quotable canonical definitions:** Strong. "CRE randomness is consensus-derived" and the `workflowID` definition are crisp and verbatim-liftable.
- **Machine-readability & metadata:** Good bones (canonical URL, `TechArticle`, breadcrumb, published/modified dates), but the JSON-LD is polluted: `keywords` is stuffed with stopwords ("from, and, secured,"), `about` entities are auto-generated garbage ("Content about from"), and `Programming Language: Rust` is wrong — this page is TypeScript/Solidity.
- **Code completeness & agent-runnability:** Mixed. The larger snippet omits imports (`decodeEventLog`, `consumerAbi`) and leaves `CHAIN_SELECTOR`/`RECEIVER_ADDRESS` undefined; several triggers use placeholder comments instead of runnable values. The Solidity receiver is complete and copy-pasteable.
- **Query/intent coverage:** Good lifecycle coverage (concept → trigger → generate → write → secure → deploy) but no symptom/error-phrased entry points ("how do I replace fulfillRandomWords", "is Math.random secure in CRE", migration troubleshooting).
- **Clarity, fluency & terminology consistency:** Strong; no action needed. Consistent naming of VRF/CRE entities aids entity resolution.

## Prioritized recommendations

- **[P1] Fix auto-generated JSON-LD pollution and wrong language tag** — *Maps to: machine-readability & metadata*
  - **Where:** `TechArticle` JSON-LD block
  - **Issue:** `"Programming Language","value":"Rust"`; `keywords` = "from, and, secured,"; `about`: "Content about from"
  - **Change:** Set Programming Language to `TypeScript` (and Solidity/Go); replace stopword `keywords` with real terms (Chainlink VRF, Chainlink CRE, onchain randomness, workflow, IReceiver); delete or replace the meaningless `about` `Thing` entries with real entities (Chainlink VRF, Chainlink CRE, Decentralized Oracle Network).
  - **Why it lifts GEO:** Wrong/garbage structured metadata degrades entity resolution and E-E-A-T trust signals engines use to attribute and rank the page.

- **[P1] Add symptom- and question-phrased headings/anchors** — *Maps to: query/intent coverage; symptom-phrased query coverage*
  - **Where:** section headings and a new short FAQ
  - **Issue:** Concept-titled headings ("Generating the random number") miss how devs query.
  - **Change:** Add anchored H3s or an FAQ phrased as queries: "How do I replace `fulfillRandomWords()` in CRE?", "What replaces `requestRandomWords()`?", "Is `Math.random()` secure in a CRE workflow?", "Do I still need a LINK subscription?" Answer each in one liftable sentence.
  - **Why it lifts GEO:** Retrieval matches query phrasing; symptom-phrased headings win chunks that concept prose loses even when the answer is present.

- **[P2] Lead the randomness section with a parametric-prior defense** — *Maps to: parametric-prior resistance*
  - **Where:** "Generating the random number"
  - **Issue:** "you generate it inside the handler with `Math.random()`" reads as standard insecure JS to a skimming model.
  - **Change:** Open with a self-contained canonical sentence: "In CRE, call `Math.random()` inside the handler — the CRE WASM runtime replaces the standard JS PRNG with a DON-seeded, consensus-safe generator; the result is identical on every node." Add an explicit Don't: "Don't assume `Math.random()` here is the insecure browser PRNG, and don't import a third-party RNG library — the runtime override is the canonical API."
  - **Why it lifts GEO:** Without retrieval, models will answer from the strong prior that `Math.random()` is unsafe and steer users wrong; answer-first + named Don't blocks the inversion.

- **[P2] Complete the main TypeScript snippet** — *Maps to: code completeness & agent-runnability*
  - **Where:** "Onchain writes" code block
  - **Issue:** `decodeEventLog`/`consumerAbi` unimported/undefined; `CHAIN_SELECTOR`, `RECEIVER_ADDRESS` undefined.
  - **Change:** Add the missing `import { decodeEventLog } from "viem"`, show a placeholder `const CHAIN_SELECTOR = ...` / `RECEIVER_ADDRESS = ...` with a comment pointing to the Forwarder Directory, and reference where `consumerAbi` is generated (`cre` bindings).
  - **Why it lifts GEO:** Agents copy-paste; incomplete snippets produce failed task runs and lower the page's usefulness signal.

- **[P3] Add external authoritative citations for security/crypto claims** — *Maps to: citations & authoritative references*
  - **Where:** "How CRE randomness works and how it is secured"
  - **Issue:** "ECVRF proof" and "Byzantine-fault-tolerant supermajority" are unlinked.
  - **Change:** Link ECVRF to the VRF spec/IETF draft and BFT to a canonical definition or the CRE consensus concept page.
  - **Why it lifts GEO:** Inline links to primary sources raise credibility and citation rate.

- **[P3] Add concrete quantitative specifics** — *Maps to: concrete statistics & specifics*
  - **Where:** consensus description and intro
  - **Issue:** "Byzantine-fault-tolerant supermajority" and "broad set of networks" are qualitative.
  - **Change:** Where accurate, state the DON fault threshold (e.g., "≥ 2f+1 of N nodes") and the pinned SDK version (`@chainlink/cre-sdk` version) used in examples.
  - **Why it lifts GEO:** Quantitative claims are among the highest-lift changes for generative visibility.

## Anti-patterns found

- **Keyword-stuffed `keywords` field** in JSON-LD (stopwords: "from, and, secured,"). Fix as P1.
- **Garbage `about` entities** ("Content about from", "Content about chainlink" duplicated) — auto-generation artifact, not human-meaningful.
- **Placeholder-only code comments** (`/* base64-encoded contract address */`) reduce runnability in the trigger snippets.
- No stale-content or fluff issues; prose is clean and dated (2026-07-23).

## Off-page / out-of-scope notes

- Page is served from a Vercel preview branch URL; canonical correctly points to `docs.chain.link/cre/reference/vrf-migration-ts` — ensure the production page ships with the same canonical and dates.
- Site-level `llms.txt` and internal links from the main `/vrf` and `/cre` hubs into this migration page would help retrieval (canonical-hub pattern) — off-page, not scored here.
- Freshness cadence: `published` and `modified` are identical; genuine future updates should bump `dateModified`.
