# GEO Audit — The Trigger Capability

**URL:** https://docs.chain.link/cre/capabilities/triggers
**Analyzed:** 2026-09-18T14:45:29.088Z
**Content type:** developer documentation / conceptual overview (hub page)

## GEO Score: 60/100 — Good

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 7 | 10.5 |
| Concrete statistics & specifics | 12 | 3 | 3.6 |
| Citations & authoritative references | 10 | 4 | 4.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 3 | 3.0 |
| Query/intent coverage | 10 | 5 | 5.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **60.1** |

## Summary

This is a short (182-word) conceptual overview that defines the CRE Trigger capability and enumerates three trigger types. Its biggest strength is answer-first extractability: the opening sentence is a clean, liftable canonical definition, and each trigger type has a crisp one-line description. Its biggest opportunity is concreteness — the page carries only 1 numeral, no code, no comparison table, and no primary-source links, so it will lose retrieval to any sibling page that names cron syntax, supported chains, or HTTP limits. Honest verdict: a competent hub page that reads well for humans but under-serves generative engines and coding agents who need specifics and how-to phrasing.

## Dimension analysis

- **Answer-first extractability** — Strong. Opens with "**Triggers** are a special type of capability that initiate the execution of your workflow," and each bullet leads with the trigger's function. No action needed.
- **Structural scannability** — Good hierarchy (1 H1, 2 H2, 0 level skips), bullets used well. Weak point: a trigger-type comparison table would chunk better than prose bullets for extraction.
- **Concrete statistics & specifics** — Weak. Only 1 numeral in prose, one vague quantifier ("several"). No cron syntax, no list of supported chains, no HTTP auth mechanism detail, no rate/size limits.
- **Citations & authoritative references** — 5 internal links, 0 external/primary. Fine for internal navigation, but no canonical spec references (e.g., cron format, EVM log/event spec) to raise attributability.
- **Quotable canonical definitions** — Strong. The trigger definition and the three type definitions are each self-contained and verbatim-liftable.
- **Machine-readability & metadata** — Solid: valid BreadcrumbList + TechArticle JSON-LD, canonical URL, description. Weak signals: `datePublished` == `dateModified` (never-revised stamp), auto-generated `keywords` (includes stopword "your") and `about` "Content about X" templates.
- **Code completeness & agent-runnability** — Weak. Zero code fences. Trigger registration is inherently code; at least one minimal snippet per type would materially help agents.
- **Query/intent coverage** — Partial. Answers "what is a trigger" and "what types exist," but no "how do I register a cron trigger," no supported-network question, no troubleshooting/symptom phrasing.
- **Clarity, fluency & terminology consistency** — Strong; consistent naming (`Cron`, `HTTP`, `EVM Log`). No action needed.

## Prioritized recommendations

- **[P1] Add concrete specifics to each trigger type** — *Maps to: concrete statistics & specifics*
  - **Where:** "Trigger types" bullets
  - **Issue:** "fires at a specific time or on a recurring schedule (e.g., 'every 5 minutes')"
  - **Change:** State the cron expression format accepted (e.g., 5-/6-field syntax with an example string), the list/count of supported EVM chains for `EVM Log`, and the HTTP auth key type and any payload/rate limits. Replace "several types" with "three types."
  - **Why it lifts GEO:** Quantitative specifics are the highest-lift retrieval signal; this page currently offers almost none, so it cannot win specific queries.

- **[P1] Add a trigger-type comparison table** — *Maps to: machine-scannability & justification structure*
  - **Where:** under "Trigger types"
  - **Issue:** prose bullets don't expose extractable decision factors
  - **Change:** Add a table with columns Trigger | Fires when | Config/param | Supported networks | Auth required, one row per trigger.
  - **Why it lifts GEO:** Tables let engines extract reasons and build justified comparative answers; this is a natural comparison page.

- **[P2] Add symptom/how-to headings** — *Maps to: symptom-phrased query coverage*
  - **Where:** new H2/H3 sections or FAQ block
  - **Issue:** no "how do I…" or error-phrased coverage; only concept prose
  - **Change:** Add short sections titled e.g. "How do I trigger a workflow on a schedule?", "How do I authorize HTTP triggers?", "Which chains support EVM Log triggers?" — each with a 1–2 sentence answer linking to the SDK guide.
  - **Why it lifts GEO:** Devs/agents query by task and symptom; question-phrased headings win retrieval that concept-titled prose loses.

- **[P2] Add one minimal code snippet per trigger type** — *Maps to: code completeness & agent-runnability*
  - **Where:** each trigger-type bullet or a new "Examples" section
  - **Issue:** 0 fenced code blocks on a code-centric topic
  - **Change:** Add a labeled TypeScript fence showing registration of each trigger (cron, HTTP, EVM Log) with imports; or embed the canonical snippet from the SDK reference.
  - **Why it lifts GEO:** Agents reading docs to complete tasks need copy-pasteable canonical API calls; this defends against parametric-prior substitution of generic patterns.

- **[P3] Add primary/authoritative references** — *Maps to: citations & authoritative references*
  - **Where:** cron and EVM Log descriptions
  - **Issue:** 0 external links; claims not attributable to a spec
  - **Change:** Link the cron syntax to its canonical definition and the EVM Log trigger to the relevant event/log documentation.
  - **Why it lifts GEO:** Inline authoritative links raise credibility and citation rate.

- **[P3] Correct freshness and auto-generated metadata** — *Maps to: machine-readability & metadata*
  - **Where:** JSON-LD `keywords`/`about`, `dateModified`
  - **Issue:** `datePublished` == `dateModified`; keywords list is comma-split fragments incl. "your"; `about` uses "Content about trigger" template
  - **Change:** Populate `about` with real entities (Cron trigger, HTTP trigger, EVM Log trigger), curate `keywords`, and update `dateModified` on genuine revision.
  - **Why it lifts GEO:** Clean entity metadata and visible freshness aid E-E-A-T and entity resolution; low individual lift but easy.

## Anti-patterns found

- Vague quantifier "several types" where an exact count ("three") is known.
- Auto-generated JSON-LD `about` ("Content about trigger") and `keywords` containing a stopword — templated, not curated.
- Identical publish/modify dates — a never-revised freshness signal.

## Off-page / out-of-scope notes

- Freshness cadence: identical `datePublished`/`dateModified` is a site-generator pattern, not fixable in body copy alone.
- Canonical-hub linking: ensure the SDK reference and using-triggers guide link *back* into this page so it accrues internal authority as the concept hub.
- Consider a site-level `llms.txt` enumerating CRE capability pages for agent discovery.
