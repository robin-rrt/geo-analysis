# GEO Audit — Avoiding Non-Determinism in Workflows

**URL:** https://docs.chain.link/cre/concepts/non-determinism-go
**Analyzed:** 2026-07-15T17:37:01.143Z
**Content type:** developer documentation / conceptual reference (Go)

## GEO Score: 81/100 — Strong

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 9 | 13.5 |
| Structural scannability & chunkability | 15 | 9 | 13.5 |
| Concrete statistics & specifics | 12 | 7 | 8.4 |
| Citations & authoritative references | 10 | 6 | 6.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 8 | 9.6 |
| Code completeness & agent-runnability | 10 | 8 | 8.0 |
| Query/intent coverage | 10 | 8 | 8.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **80.6** |

## Summary

This is a well-built conceptual page enumerating seven concrete sources of non-determinism in CRE Go workflows, each with a problem/solution pair and a strong upfront comparison table. Its biggest GEO strength is machine-scannability: the "Don't Use / Use Instead" table and the Do/Don't summary are ideal extraction units for generative engines. The biggest opportunity is adding authoritative external citations (Go spec, protobuf docs) and a few quantitative specifics (SDK version, quorum threshold). Honest verdict: near best-in-class for agent-readable docs; a handful of surgical additions would push it into Exemplary.

## Dimension analysis

- **Answer-first extractability** — Strong; no action needed. Opens with a self-contained causal chain: "Code diverges → Different request IDs → No quorum → Workflow fails," and each numbered section leads with problem then solution.
- **Structural scannability & chunkability** — Strong; no action needed. Clean H2/H3, a lead comparison table, per-topic sections, and a Do/Don't summary give clean RAG chunk boundaries.
- **Concrete statistics & specifics** — Mostly qualitative. Names specific APIs/packages (good) but lacks numbers: no SDK version, no consensus quorum fraction (e.g., "2f+1"), no statement of how many nodes typically run. Add these where accurate.
- **Citations & authoritative references** — Weak spot. Good internal links (Time in CRE, Consensus Computing) but zero external primary sources for claims like Go map randomization or protobuf non-determinism.
- **Quotable canonical definitions** — Strong. "DON Time—a consensus-derived timestamp that all nodes agree on" is verbatim-liftable; the bolded consensus-failure claim is quotable.
- **Machine-readability & metadata** — Strong schema (`TechArticle`/`LearningResource`), canonical, published/modified dates present. Minor: auto-generated `keywords` and `about` fields are noise ("Content about non", "Content about determinism").
- **Code completeness & agent-runnability** — Good. Imports shown, SDK path explicit. No `package`/`func` wrapper and no expected output; the struct-key map literal may confuse agents.
- **Query/intent coverage** — Good lifecycle of pitfalls, but no explicit error-message/troubleshooting section (e.g., what a consensus failure looks like in logs).
- **Clarity, fluency & terminology consistency** — Strong; no action needed. Consistent use of DON mode, consensus, CRE SDK.

## Prioritized recommendations

- **[P1] Add authoritative external citations for each pitfall** — *Maps to: Cited, authoritative references*
  - **Where:** Sections 1–3 (Map iteration, JSON, Protocol Buffers)
  - **Issue:** "Go maps are designed to iterate in random order for security reasons."
  - **Change:** Link the claim to the Go spec / Go blog on map iteration order, and link protobuf non-determinism to the official `proto.MarshalOptions` godoc.
  - **Why it lifts GEO:** Inline links to primary sources raise credibility and citation rate.

- **[P2] Inject concrete specifics** — *Maps to: Concrete statistics & specifics*
  - **Where:** "The problem: Why determinism matters" and section 6 (LLMs)
  - **Issue:** "multiple nodes execute the same code independently … must reach consensus"
  - **Change:** State the quorum condition numerically (e.g., how many of N nodes must agree) and pin the SDK module version used in imports.
  - **Why it lifts GEO:** Quantitative claims are among the highest-lift additions for engine visibility.

- **[P3] Add a short troubleshooting / error-signature section** — *Maps to: Query/intent coverage*
  - **Where:** After section 6 or before Best practices
  - **Issue:** No mapping from symptom (log/error) to cause.
  - **Change:** Add "How consensus failure appears" — e.g., quorum/timeout error text an agent might grep, mapped back to the seven causes.
  - **Why it lifts GEO:** Matches how devs/agents actually query ("workflow consensus failed", error strings).

- **[P3] Make code snippets fully runnable and label them** — *Maps to: Code completeness & agent-runnability*
  - **Where:** Sections 1 (both snippets)
  - **Issue:** Snippets lack `package`/`func` context; struct-key map literal is terse.
  - **Change:** Wrap in a minimal `func` and annotate expected iteration output as a comment; label blocks as `go`.
  - **Why it lifts GEO:** Copy-pasteable, output-verified snippets increase agent trust and reuse.

- **[P3] Clean up auto-generated schema fields** — *Maps to: Machine-readability & metadata*
  - **Where:** JSON-LD `keywords` and `about`
  - **Issue:** `"about":[{"name":"Non"},{"name":"Determinism"}]`; keyword list is fragmented words.
  - **Change:** Replace with meaningful entities ("Non-determinism", "Chainlink CRE", "DON consensus", "Go concurrency").
  - **Why it lifts GEO:** Clean structured metadata aids entity resolution; fragmented tokens add noise.

## Anti-patterns found

- Auto-generated JSON-LD `about`/`keywords` produce meaningless entity fragments ("Content about non").
- Minor: code snippets omit surrounding `func`/`package` context and show no expected output.

## Off-page / out-of-scope notes

- Consider a site-level `llms.txt` exposing this and sibling CRE concept pages for agent discovery.
- `dateModified` (2026-04-20) is present and healthy — maintain the freshness cadence as the CRE SDK evolves.
- External citation authority (Go/protobuf docs) is on-page fixable; earned third-party references are not.
