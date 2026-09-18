# GEO Audit — Selecting Quality Data Feeds

**URL:** https://docs.chain.link/data-feeds/selecting-data-feeds
**Analyzed:** 2026-09-18T14:48:09.508Z
**Content type:** developer documentation / conceptual risk-guidance (feed selection)

## GEO Score: 64/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 6 | 9.0 |
| Structural scannability & chunkability | 15 | 8 | 12.0 |
| Concrete statistics & specifics | 12 | 6 | 7.2 |
| Citations & authoritative references | 10 | 6 | 6.0 |
| Quotable canonical definitions | 8 | 7 | 5.6 |
| Machine-readability & metadata | 12 | 6 | 7.2 |
| Code completeness & agent-runnability | 10 | 5 | 5.0 |
| Query/intent coverage | 10 | 6 | 6.0 |
| Clarity, fluency & terminology consistency | 8 | 7 | 5.6 |
| **Total** | **100** | | **63.6** |

## Summary

This is a well-structured conceptual/policy page defining Chainlink's data-feed risk categories, market hours, and mitigation practices. Its biggest GEO strength is clean, deep-but-not-oversized chunking (32 sections, median 130 words, 0 level skips) plus a strong, specifics-rich market-hours table. Its biggest opportunity is answer-first leads: the risk-category sections open with repetitive shared boilerplate ("These feeds also follow a standardized data feeds workflow…") rather than the distinguishing definition an engine would lift, and no headings are phrased as the symptom questions developers actually ask. Solid, retrievable page that under-serves extraction and query-matching relative to its content quality.

## Dimension analysis

- **Answer-first extractability:** Category sections bury the differentiator behind shared prose ("These feeds also follow a standardized data feeds workflow to report market prices"). The intro is diffuse rather than a liftable one-liner. Weak.
- **Structural scannability:** Strong; no action needed. 32 headings, 1 H1, max depth H4, 0 skips, all sections under 600 words.
- **Concrete statistics & specifics:** The market-hours table is exemplary (exact ET windows, holiday rules, 15-min UK delay, $1.05 bound example). But risk sections lean on vague quantifiers (measured: "many, several, various, significant, most") without thresholds. Mixed.
- **Citations & authoritative references:** Good internal cross-linking (92 internal links) and some useful external refs (Aave CAPO, Wikipedia soak-testing/corporate-action); 0 links to primary specs/standards and 1 opaque "here" link flagged. Adequate.
- **Quotable canonical definitions:** Several crisp, liftable statements exist — "Exchange rate feeds are tied to specific protocols… report the internal redemption rates," and the Bounded Feed $1.05 example. Reasonably strong.
- **Machine-readability & metadata:** TechArticle + BreadcrumbList JSON-LD parse cleanly with canonical and full OG/Twitter tags, but quality signals are degraded: `keywords` is stopword junk ("Learn, how, assess… that, you, use, your"), all 4 `about` entries are the auto-generated "Content about X" template, `programmingLanguage: TypeScript` is declared with zero code on the page, and datePublished == dateModified (no revision/freshness signal). Mixed.
- **Code completeness & agent-runnability:** No code blocks. Largely acceptable for a policy page, but the page describes circuit breakers, freshness checks, and `latestRoundData` — a short snippet would raise agent-runnability. Neutral.
- **Query/intent coverage:** Broad lifecycle coverage (categories → market hours → mitigation → wrapped assets), but nothing is symptom- or question-phrased; concept-titled headings will lose retrieval on "why is my feed stale on weekends" style queries. Mixed.
- **Clarity, fluency & terminology consistency:** Consistent entity naming (Market Pricing Risk, Data Feeds, single-source feeds); prose is clean though the "Developers remain responsible…" clause repeats verbatim across five sections. Good.

## Prioritized recommendations

- **[P1] Lead each risk-category section with its distinguishing definition** — *Maps to: answer-first extractability, parametric-prior resistance*
  - **Where:** 🟡 Medium / 🟠 High / 🔴 Very High Market Pricing Risk sections
  - **Issue:** "These feeds also follow a standardized data feeds workflow to report market prices for an asset pair."
  - **Change:** Open each with the differentiator first, e.g. "Medium Market Pricing Risk feeds price asset pairs that are harder to value reliably — due to low or concentrated liquidity, cross-rate exposure, or wide provider spreads — while still using the standard decentralized aggregation workflow." Keep the shared workflow sentence second.
  - **Why it lifts GEO:** Engines lift the first sentence of a chunk; identical openers make the four categories indistinguishable and un-citable as separate answers.

- **[P1] Add symptom/question-phrased headings and a short FAQ** — *Maps to: query/intent coverage*
  - **Where:** Market hours section; end of page
  - **Issue:** Concept-titled headings ("Market hours") miss symptom queries like "why is my equity feed returning stale prices on the weekend."
  - **Change:** Add H3s or an FAQ phrased as queries: "Why does my US equity feed stop updating on weekends and holidays?", "How do I detect and handle a stale single-source feed?", "Which feed should I use for a wrapped asset like WBTC?" — each answered in 1–2 sentences linking to the existing section.
  - **Why it lifts GEO:** Symptom-phrased headings win retrieval that concept-titled prose loses even when the answer is present verbatim.

- **[P2] Fix degraded schema quality signals** — *Maps to: machine-readability & metadata*
  - **Where:** `<head>` JSON-LD / frontmatter generator
  - **Issue:** `keywords`="Learn, how, assess… that, you, use, your"; `about`=4× "Content about X"; `programmingLanguage`:"TypeScript" with no code; identical published/modified dates.
  - **Change:** Replace keywords with real entities (Chainlink Data Feeds, Market Pricing Risk, single-source feeds, bounded feeds, market hours); set `about` to those Things; drop the false `programmingLanguage` PropertyValue; wire `dateModified` to real edit time.
  - **Why it lifts GEO:** Template/stopword metadata and a false language tag weaken E-E-A-T entity resolution; a stamped-once date gives no freshness signal. Cheap, but lower-impact than the retrieval fixes above.

- **[P2] Add a canonical answer-first summary to the intro** — *Maps to: answer-first, quotable definitions*
  - **Where:** Page intro, before "When you design your applications…"
  - **Issue:** Intro opens with soft guidance, not a liftable definition of the page's purpose.
  - **Change:** Lead with one liftable sentence: "Chainlink classifies every listed data feed into one of eight risk categories — from 🟢 Low to 🔴 Very High Market Pricing Risk, plus New Token, Custom, Deprecating, and Unrated — to signal its intended use and market-integrity risk." Then keep the responsibility paragraph.
  - **Why it lifts GEO:** Gives engines a self-contained, quotable overview that names the canonical taxonomy up front.

- **[P2] Replace vague quantifiers in mitigation guidance with specifics where they exist** — *Maps to: concrete statistics & specifics*
  - **Where:** Risk Mitigation, Deprecating, single-source sections
  - **Issue:** Measured vague quantifiers ("several", "various", "significant"); mitigation described only qualitatively.
  - **Change:** Where a number exists, state it (deprecation notice is "two weeks" — good; surface it in the mitigation list too), and link freshness/deviation guidance to concrete heartbeat/deviation-threshold references on the feed pages rather than "recent fresh input."
  - **Why it lifts GEO:** Quantitative claims are among the highest-lift changes; qualitative-only prose underperforms.

- **[P3] Fix opaque link and add primary-source citations** — *Maps to: citations & authoritative references*
  - **Where:** Unknown and Known Users ("you can do so [here]"); risk sections
  - **Issue:** 1 opaque "here" anchor; 0 links to primary sources.
  - **Change:** Rename "here" to "submit your contact information"; where the page references methodology (volume-weighted average, three-layer aggregation), link the canonical Chainlink methodology/spec page as a primary source.
  - **Why it lifts GEO:** Descriptive anchors and primary-source links raise citation rate and attributability.

## Anti-patterns found

- Repeated verbatim boilerplate across five sections ("Developers remain responsible for ensuring that protocol risk parameters are configured appropriately…") — dilutes chunk distinctiveness; consider a single linked "shared responsibilities" note.
- Auto-generated schema junk: stopword `keywords`, template `about` entries, false `programmingLanguage: TypeScript`.
- Stale-date signal: `datePublished` identical to `dateModified`.
- No keyword stuffing, marketing fluff, or unresolved cross-references detected; internal anchors resolve.

## Off-page / out-of-scope notes

- Freshness cadence: the generator should stamp a real `dateModified` on edits; this page can't fix that alone.
- Site-level `llms.txt` and a canonical "Data Feeds" hub linking into this page would strengthen retrieval as a canonical source.
- CLI note: raw `<head>` was provided and parsed; schema findings above are verified, not assumed.
