# GEO Audit — Migrating from VRF v2

**URL:** https://docs.chain.link/vrf/v2-5/migration-from-v2
**Analyzed:** 2026-09-18T14:46:23.129Z
**Content type:** developer documentation / migration guide

## GEO Score: 67/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 7 | 10.5 |
| Structural scannability & chunkability | 15 | 7 | 10.5 |
| Concrete statistics & specifics | 12 | 6 | 7.2 |
| Citations & authoritative references | 10 | 8 | 8.0 |
| Quotable canonical definitions | 8 | 7 | 5.6 |
| Machine-readability & metadata | 12 | 6 | 7.2 |
| Code completeness & agent-runnability | 10 | 6 | 6.0 |
| Query/intent coverage | 10 | 6 | 6.0 |
| Clarity, fluency & terminology consistency | 8 | 7 | 5.6 |
| **Total** | **100** | | **67** |

## Summary

This is a solid, well-structured migration guide that opens with a strong liftable fact ("VRF V2.5 replaces both VRF V1 and VRF V2 on November 29, 2024") and links generously to primary sources (GitHub contracts, Remix). Its single biggest GEO weakness is the absence of any comparison table — a migration page is the canonical use case for a v2→v2.5 diff table, and the measured facts confirm **0 tables** despite two side-by-side code comparisons that engines cannot easily diff from tabbed code blocks. The second-biggest opportunity is symptom/error query coverage: there is no troubleshooting section, so agents hitting real migration errors (type mismatches, wrong argument counts) won't retrieve this page. Honest verdict: a good page that leaks retrieval and extractability value it could easily recover.

## Dimension analysis

- **Answer-first extractability:** Strong opening; "the subscription ID has changed types from `uint64`… to `uint256`" is perfectly liftable. Weak: `setCoordinator function` section is one vague sentence with no signature; tabbed labels like "SubscriptionDirect funding" flatten into ambiguous prose.
- **Structural scannability & chunkability:** Clean hierarchy, 0 level skips, no oversized sections (max 461 words). Weak: **0 tables** — the two "Compare example code" blocks and the billing changes both beg for a table an engine can extract row-by-row.
- **Concrete statistics & specifics:** Version strings, addresses, and keyHashes are present in code. Weak: billing prose is qualitative — "premium fee has changed… to a percentage-based premium," overhead gas "reduced," "varies depending on the network" — with no numbers on-page; the vague quantifier "many" appears.
- **Citations & authoritative references:** Strong; 7 links to primary sources (GitHub pinned to `contracts-v1.3.0`, npm package version 1.1.1). No action needed.
- **Quotable canonical definitions:** The date-of-replacement sentence and the subID type-change sentence are crisp. Weak: no one-line definition of what `extraArgs`/`ExtraArgsV1` actually is near first use.
- **Machine-readability & metadata:** Valid TechArticle + BreadcrumbList, canonical, full og/twitter. Weak: `about[]` is auto-generated garbage — "Migrating"/"From"/"Vrf" with "Content about from" — providing no entity signal; `datePublished` equals `dateModified` (generator-stamped, no revision signal); `programmingLanguage` absent despite 6 solidity fences.
- **Code completeness & agent-runnability:** All 6 blocks tagged solidity; full contracts one click away in Remix. Weak: heavy `...` elision means no snippet is copy-paste-complete; 2 blocks show no imports.
- **Query/intent coverage:** Good lifecycle (benefits → code changes → billing → walkthrough → examples). Weak: no FAQ/troubleshooting, no error-string or "how do I fix…" headings — the queries agents actually type during a failing migration.
- **Clarity, fluency & terminology consistency:** Clean prose. Weak: version casing is inconsistent — "VRF V2.5", "VRF v2.5", and "v2.5" all appear, which muddies entity resolution.

## Prioritized recommendations

- **[P1] Add a v2 → v2.5 migration diff table** — *Maps to: machine-scannability & justification structure*
  - **Where:** top of `## Code changes`, before the sub-sections.
  - **Issue:** 0 tables; the diffs live only in tabbed code blocks engines can't align.
  - **Change:** Insert a table with columns *Item | VRF v2 | VRF v2.5* covering base contract (`VRFConsumerBaseV2`→`VRFConsumerBaseV2Plus`), coordinator, subId type (`uint64`→`uint256`), request format (positional args → `RandomWordsRequest` struct), payment (LINK only → LINK or native), and return (`requestId` → `(requestId, requestPrice)`).
  - **Why it lifts GEO:** Tables are directly extractable and let an engine answer "what changed between v2 and v2.5" in one lifted unit.

- **[P1] Add a symptom/error-phrased troubleshooting section** — *Maps to: symptom-phrased query coverage*
  - **Where:** new `## Troubleshooting migration errors` near the end.
  - **Issue:** No error-string coverage; devs query by compiler/runtime errors, not "migration walkthrough."
  - **Change:** Add H3s phrased as the exact errors — e.g. "Error: wrong number of arguments to requestRandomWords", "Type uint64 is not implicitly convertible to uint256 (subId)", "fulfillRandomWords signature mismatch (memory vs calldata)" — each with the one-line fix.
  - **Why it lifts GEO:** Symptom-titled headings win retrieval that concept-titled prose loses even when the answer is already in body text.

- **[P2] Give the `setCoordinator` section an answer-first, self-contained lead** — *Maps to: answer-first extractability*
  - **Where:** `### setCoordinator function`.
  - **Issue:** "Add the `setCoordinator` function to your contract so that you can easily update…"
  - **Change:** Lead with the signature and inherited source: "`setCoordinator(address _vrfCoordinator)` is inherited from `VRFConsumerBaseV2Plus` and lets the owner repoint the contract to a new coordinator without redeploying." 
  - **Why it lifts GEO:** A lifted chunk currently can't answer "what is setCoordinator" — a signature-first sentence makes it standalone.

- **[P2] Put representative billing numbers on-page** — *Maps to: concrete statistics & specifics*
  - **Where:** `## Billing changes`.
  - **Issue:** "premium fee has changed… to a percentage-based premium"; overhead gas "reduced" / "varies."
  - **Change:** Add one representative figure with a link (e.g. "the premium is now a network-specific percentage, e.g. X% on Ethereum mainnet") rather than deferring entirely to Supported Networks; state the wrapper-overhead reduction quantitatively if a fixed number exists.
  - **Why it lifts GEO:** Quantitative claims are among the highest-lift changes; qualitative-only prose underperforms and won't be cited for billing questions.

- **[P2] Fix the JSON-LD `about[]` entities and declare `programmingLanguage`** — *Maps to: machine-readability & metadata*
  - **Where:** TechArticle JSON-LD.
  - **Issue:** `about` = "Migrating"/"From"/"Vrf" with "Content about from"; `programmingLanguage` absent.
  - **Change:** Replace with real entities — "Chainlink VRF", "Chainlink VRF v2.5", "Smart contract migration" — and add `"programmingLanguage": "Solidity"`.
  - **Why it lifts GEO:** Tokenized filler entities give engines no topical signal; correct `about`/`programmingLanguage` aid entity resolution and trust.

- **[P3] Normalize version casing to one form** — *Maps to: clarity & terminology consistency*
  - **Where:** throughout.
  - **Issue:** "VRF V2.5", "VRF v2.5", and "v2.5" used interchangeably.
  - **Change:** Pick one canonical form (the product blog uses "VRF v2.5") and apply consistently.
  - **Why it lifts GEO:** Consistent naming strengthens entity resolution across the corpus.

- **[P3] Define `extraArgs`/`ExtraArgsV1` at first use** — *Maps to: quotable canonical definitions*
  - **Where:** `### New request format`, after the first code block.
  - **Issue:** `extraArgs` is used before it's defined.
  - **Change:** Add: "`extraArgs` is an ABI-encoded `VRFV2PlusClient.ExtraArgsV1` struct carrying forward-compatible options; today its only field is `nativePayment` (bool)."
  - **Why it lifts GEO:** A crisp definition near first use is verbatim-liftable for "what is extraArgs in VRF v2.5."

## Anti-patterns found

- Auto-generated `about[]` entities in JSON-LD ("Content about from") — non-descriptive metadata.
- `datePublished` identical to `dateModified` (generator-stamped) — no freshness/revision signal.
- Heavy `...` elision in comparison snippets — not copy-paste-complete (acceptable given full Remix links, but flagged).
- Minor version-casing inconsistency (V2.5 / v2.5 / v2-5).
- No walls of prose, no keyword stuffing, no marketing fluff in the body.

## Off-page / out-of-scope notes

- `datePublished`/`dateModified` both show a future date (2026-09-18) and are generator-stamped; a real last-reviewed cadence would strengthen E-E-A-T site-wide.
- Consider a site-level `llms.txt` and ensuring this page is linked from the VRF v2.5 landing/getting-started hub so migration queries route here (canonical-hub pattern).
- Third-party/earned citations (e.g. from the v2.5 launch blog back into this migration page) would help retrieval but are off-page.
