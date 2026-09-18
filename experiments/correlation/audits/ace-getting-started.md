# GEO Audit — Getting Started with ACE

**URL:** https://docs.chain.link/ace/getting-started
**Analyzed:** 2026-09-18T14:45:28.822Z
**Content type:** developer documentation / onboarding hub (routing page)

## GEO Score: 62/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 7 | 10.5 |
| Structural scannability & chunkability | 15 | 8 | 12.0 |
| Concrete statistics & specifics | 12 | 3 | 3.6 |
| Citations & authoritative references | 10 | 6 | 6.0 |
| Quotable canonical definitions | 8 | 5 | 4.0 |
| Machine-readability & metadata | 12 | 6 | 7.2 |
| Code completeness & agent-runnability | 10 | 5 | 5.0 |
| Query/intent coverage | 10 | 7 | 7.0 |
| Clarity, fluency & terminology consistency | 8 | 8 | 6.4 |
| **Total** | **100** | | **61.7** |

## Summary

This is a lightweight onboarding hub (306 words) whose job is to route users to the three ACE managers and to shared setup — it does that cleanly with a strong comparison table and a well-phrased "Not sure which Manager you need?" decision section. Its single biggest GEO weakness is that it never defines what ACE *is* (no expansion of the acronym, no one-sentence canonical statement), so an engine that lands here cannot lift a definition and will fall back to its parametric prior. Secondary drag: schema pollution (garbage `keywords`, auto-generated `about`, broken `teaches`) and zero concrete specifics. As a router, the page is fine; as a citable source it under-earns because the entity it introduces is left undefined.

## Dimension analysis

- **Answer-first extractability (7):** Opens directly with the routing answer — "ACE offers three managers. Choose the path that matches what you need to do." Each section is self-contained. Weak point: no answer to the implied "what is ACE?" that a getting-started page invites.
- **Structural scannability (8):** Strong — table + three focused sections, median 66 words, none over 600, clean chunk boundaries. One measured level skip (H1 → H3, no H2) is the only structural flaw.
- **Concrete statistics & specifics (3):** 0 numerals in prose; vague quantifiers "many," "most" flagged. "three managers" and "four steps every ACE user completes" exist but only as words. Policy list ("volume limits, allowlists, RBAC") gives some texture; no versions, no network/chain details.
- **Citations & authoritative references (6):** 15 internal links, well-targeted (concepts, quick starts, API reference) — appropriate for a hub. Zero external/primary sources; no link to a canonical ACE overview or spec.
- **Quotable canonical definitions (5):** Per-manager one-liners are crisp and liftable. But the headline entity "ACE" has no definition sentence — the highest-value quotable statement is missing.
- **Machine-readability & metadata (6):** Good bones — valid `HowTo`/`TechArticle` + `BreadcrumbList`, canonical, 12 OG / 9 Twitter tags, and `datePublished`/`dateModified` present in `<head>` and JSON-LD (2026-03-31 / 2026-04-15). Undercut by polluted fields: `keywords` is a word-split of the description, `about[]` is auto-junk ("Content about getting/started/ace"), and `teaches` reads "How to getting started with ace."
- **Code completeness (5):** No code blocks — acceptable for a routing page; not applicable rather than a real defect. Actual setup code lives on linked child pages.
- **Query/intent coverage (7):** "Not sure which Manager you need?" is an excellent symptom-phrased heading matching how users actually decide. Missing: "What is Chainlink ACE?" / "What does ACE stand for?" coverage.
- **Clarity, fluency & terminology consistency (8):** Clean, consistent naming of the three managers and CCIDs. Strong; no action needed.

## Prioritized recommendations

- **[P1] Add a canonical ACE definition as the first liftable sentence** — *Maps to: Quotable canonical definitions / parametric-prior resistance*
  - **Where:** Under the H1, before the table.
  - **Issue:** Page opens "ACE offers three managers" — the entity is never defined.
  - **Change:** Add one sentence, e.g. "Chainlink ACE (Automated Compliance Engine) is a framework for enforcing compliance policies, managing cross-chain identities, and querying compliance data on smart contracts." Expand the acronym on first use.
  - **Why it lifts GEO:** When retrieval hits this page, engines can lift a self-contained definition; without it they answer "what is ACE" from priors and may invent it.

- **[P1] Add a "What is ACE / what does ACE stand for?" intent hook** — *Maps to: Query/intent coverage*
  - **Where:** New short lead paragraph or a linked concepts anchor.
  - **Issue:** No content matches the most common first query for a new product.
  - **Change:** Fold the acronym expansion + one-line scope statement into the opener, and link an "ACE overview/concepts" page for depth.
  - **Why it lifts GEO:** Captures concept-level retrieval this router currently loses to child pages.

- **[P2] Fix polluted schema fields** — *Maps to: Machine-readability & metadata*
  - **Where:** JSON-LD `TechArticle` block.
  - **Issue:** `keywords` is a broken word-split; `about[]` = "Content about getting/started/ace"; `teaches` = "How to getting started with ace."
  - **Change:** Replace `about[]` with real entities (`Chainlink ACE`, `Compliance`, `Cross-chain identity`); set `teaches` to a grammatical phrase ("How to onboard to Chainlink ACE"); either curate `keywords` to a handful of real terms or remove it.
  - **Why it lifts GEO:** Clean entity metadata aids resolution and trust; garbage fields are neutral-to-negative signals.

- **[P2] Replace vague quantifiers with counts** — *Maps to: Concrete statistics & specifics*
  - **Where:** "Not sure which Manager you need?" and shared-step bullet.
  - **Issue:** "Many organizations use **both managers**"; shared step described only as "the four steps."
  - **Change:** Keep "four steps" but enumerate them inline (create org, share Org ID, generate API key, set up CRE Connect Wallets); reword "Many" to a concrete framing where possible.
  - **Why it lifts GEO:** Specific, countable claims are among the highest-lift retrievable content; qualitative-only prose underperforms.

- **[P3] Resolve the heading level skip** — *Maps to: Structural scannability*
  - **Where:** H1 → the three `###` sections.
  - **Issue:** 1 measured level skip (no H2).
  - **Change:** Promote the three sections to H2 (they are top-level on this page).
  - **Why it lifts GEO:** Clean hierarchy improves chunk-boundary detection for RAG.

- **[P3] Add one authoritative outbound/context link** — *Maps to: Citations & authoritative references*
  - **Where:** After the definition sentence.
  - **Issue:** 0 external/primary references; no canonical ACE overview linked from the top.
  - **Change:** Link the ACE concepts/overview page (and any public spec or announcement) as the canonical source for the definition.
  - **Why it lifts GEO:** Attributable claims raise citation rate and credibility.

## Anti-patterns found

- Auto-generated `about[]` entries ("Content about getting/started/ace") and a word-split `keywords` string — low-quality metadata noise.
- Broken `teaches` value ("How to getting started with ace").
- Vague quantifiers "many"/"most" where counts are available.
- Note: measured facts report `datePublished/dateModified absent`, but both are present in `<head>` and the JSON-LD (2026-03-31 / 2026-04-15) — a parse/scope mismatch, not a missing-date defect; freshness signals are in fact present.

## Off-page / out-of-scope notes

- Freshness cadence: dates are present but ~5 months stale relative to analysis date; verify the modified date reflects real updates during Beta.
- Site-level `llms.txt` / sitemap coverage and cross-linking from parent `/ace` and sibling quick-start pages back into this hub (canonical-hub pattern) are off-page levers that would raise this router's discoverability.
