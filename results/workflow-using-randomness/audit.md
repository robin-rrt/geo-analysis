# GEO Audit — Using Randomness in Workflows

**URL:** https://docs.chain.link/cre/guides/workflow/using-randomness
**Analyzed:** 2026-07-17T21:04:09.280Z
**Content type:** developer documentation / how-to guide (CRE SDK, Go)

## GEO Score: 77/100 — Strong

| Dimension | Weight | Score (0–10) | Weighted |
|-----------|:------:|:------------:|:--------:|
| Answer-first extractability | 15 | 8 | 12.0 |
| Structural scannability & chunkability | 15 | 9 | 13.5 |
| Concrete statistics & specifics | 12 | 7 | 8.4 |
| Citations & authoritative references | 10 | 4 | 4.0 |
| Quotable canonical definitions | 8 | 8 | 6.4 |
| Machine-readability & metadata | 12 | 7 | 8.4 |
| Code completeness & agent-runnability | 10 | 9 | 9.0 |
| Query/intent coverage | 10 | 8 | 8.0 |
| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |
| **Total** | **100** | | **76.9** |

## Summary

This is a well-structured, agent-ready how-to that opens with a clear problem/solution framing and leads its core section with the canonical API (`runtime.Rand()`). Its biggest strength is chunkability: problem → solution → use cases → complete example → best practices → FAQ maps cleanly to retrievable units, and the FAQ already covers symptom queries. The biggest opportunities are missing inline citations to authoritative Go references (`math/rand`, `crypto/rand`) and a metadata bug — the JSON-LD declares the programming language as **Rust** while every snippet is Go, which corrupts entity resolution. Honest verdict: a strong page needing surgical citation and metadata fixes, not a rewrite.

## Dimension analysis

- **Answer-first extractability** — Strong. Each H2 opens with a liftable answer: "CRE provides randomness through the `runtime.Rand()` method, which returns a standard Go `*rand.Rand` object." The bolded consensus problem statement is quotable verbatim.
- **Structural scannability & chunkability** — Strong; no action needed. Clean H2/H3 hierarchy, Do/Don't blocks, mode-split sections, and FAQ. Each section stands alone.
- **Concrete statistics & specifics** — Good. Real specifics: `Intn(n)` range `[0, n)`, wei values, the exact panic string. Could name the SDK version/module path more precisely (e.g. `cre-sdk-go` version) since import paths are unpinned.
- **Citations & authoritative references** — Weak. No inline links anywhere: `math/rand`, `crypto/rand`, or the CRE DON-mode/Node-mode concept pages are all referenced by name but not linked. This is the largest single deduction.
- **Quotable canonical definitions** — Strong. The FAQ answer "No. `runtime.Rand()` returns a seeded pseudo-random number generator…" is an ideal liftable canonical statement.
- **Machine-readability & metadata** — Good schema (TechArticle, breadcrumbs, canonical, published/modified dates), but two flaws: `Programming Language: Rust` is wrong (content is Go), and `keywords` is a stuffed word-split of the description ("Generate, random, numbers, safely, CRE:…").
- **Code completeness & agent-runnability** — Strong. The complete example includes build tag, imports, `main()`, and config struct — copy-pasteable. Only gap: no shown expected log output/values.
- **Query/intent coverage** — Strong. FAQ covers "is it cryptographically secure," wrong-mode behavior, and reuse. Missing: an explicit symptom-phrased heading for the panic error string.
- **Clarity, fluency & terminology consistency** — Strong; no action needed. DON mode / Node mode used consistently throughout.

## Prioritized recommendations

- **[P1] Fix the `Programming Language: Rust` metadata error** — *Maps to: Machine-readability & metadata*
  - **Where:** JSON-LD `additionalProperty` → "Programming Language"
  - **Issue:** `"value":"Rust"` while all code is Go
  - **Change:** Set value to `"Go"`; also correct "Programming Model: Native Compiled" if the SDK compiles to `wasip1` (WASM) — reflect `WASM/wasip1`.
  - **Why it lifts GEO:** Wrong language metadata poisons entity resolution and can cause engines to mis-file or distrust the page.

- **[P1] Add a symptom-phrased heading for the panic error** — *Maps to: Query/intent coverage (symptom queries)*
  - **Where:** FAQ / Mode isolation section
  - **Issue:** Error string buried in prose: `"random cannot be used outside the mode it was created in"`
  - **Change:** Add an H3 phrased as the query, e.g. `### "random cannot be used outside the mode it was created in" — what it means and how to fix` with the answer in the first sentence.
  - **Why it lifts GEO:** Devs/agents search the literal error text; a heading match wins retrieval that body-text mentions lose.

- **[P2] Add inline authoritative links** — *Maps to: Citations & authoritative references*
  - **Where:** Solution section and the crypto FAQ answer
  - **Issue:** "For cryptographic randomness, use Go's `crypto/rand` package" (no link)
  - **Change:** Link `math/rand`, `crypto/rand`, and `*rand.Rand` to pkg.go.dev, and link "DON mode"/"Node mode" to their CRE concept pages.
  - **Why it lifts GEO:** Inline links to primary sources raise credibility and citation rate.

- **[P2] Replace the stuffed `keywords` value** — *Maps to: Machine-readability & metadata (anti-pattern)*
  - **Where:** JSON-LD `keywords`
  - **Issue:** `"Generate, random, numbers, safely, CRE:, use, runtime.Rand(), ensure, all, the…"`
  - **Change:** Use a clean concept list: `"CRE, runtime.Rand, consensus randomness, DON mode, Node mode, deterministic randomness, Go"` or remove the field.
  - **Why it lifts GEO:** Tokenized fluff signals low quality; keyword stuffing does not improve generative visibility.

- **[P2] Pin the SDK version / module reference** — *Maps to: Concrete statistics & specifics; Code completeness*
  - **Where:** Complete example imports
  - **Issue:** Import paths `github.com/smartcontractkit/cre-sdk-go/...` are unpinned
  - **Change:** Add a one-line note stating the tested `cre-sdk-go` version and Go version above the example.
  - **Why it lifts GEO:** Version specifics resist staleness and let agents reproduce reliably.

- **[P3] Add a canonical one-line TL;DR at the top** — *Maps to: Answer-first extractability; parametric-prior resistance*
  - **Where:** Directly under the H1, before "The problem"
  - **Issue:** Page currently opens with the problem, not the answer
  - **Change:** Add: "**Use `runtime.Rand()` for all randomness in CRE workflows — never Go's global `math/rand` — so every DON node produces the same sequence and can reach consensus.**"
  - **Why it lifts GEO:** Leading with the canonical API + explicit Don't defends against the generic `math/rand`/`rand.Intn` prior when the page is skimmed.

- **[P3] Show expected output in the lottery example** — *Maps to: Code completeness & agent-runnability*
  - **Where:** End of Complete example
  - **Issue:** No sample log output shown
  - **Change:** Add a short fenced block with representative log lines (winner, index, prize amount).
  - **Why it lifts GEO:** Expected output lets agents verify behavior and increases quotability.

## Anti-patterns found

- Stuffed `keywords` in JSON-LD (tokenized description fragments).
- Incorrect `Programming Language: Rust` metadata versus Go content — an entity-resolution hazard.
- Generic `about` entries ("Content about using", "Content about randomness") add no signal.
- No unresolved cross-references, no marketing fluff, no prose walls — clean otherwise.

## Off-page / out-of-scope notes

- Confirm `llms.txt` / sitemap surfaces this page under the CRE guides tree.
- Internal links from sibling CRE workflow pages (DON mode, Node mode concept pages) into this page would strengthen the canonical-hub pattern and retrieval.
- Modified date (`2026-03-17`) is present and current — good freshness signal; maintain cadence.
