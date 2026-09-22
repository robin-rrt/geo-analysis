# 6 — Overview: score graph and per-product breakdown

**Type:** ✨ feature · **Depends on:** plans 2, 4, 5 (all shipped)

## Problem

The Overview answers "how is the portfolio doing" with two numbers and a sparse
trend line. It cannot answer the question leadership actually asks first:
**which product is worst, and why.**

Nothing on the page is per-product, and the rubric's nine dimensions — the only
part that says *what to fix* — are not visible anywhere above page level.

## Why this is not a UI-only change

Dimensions live in `dashboard/pages/<key>.json`, kept out of the index by the
field allowlist that exists to stop the index regaining bulk
([plan 2](02-history-and-data-model.md)). Averaging them in the browser would
mean fetching 214 detail files to draw one section — re-creating exactly the
scaling problem the split was built to prevent.

So the aggregation happens at projection time, in a new `dashboard/products.json`.

## Data

A page's product comes from the run that produced its audit — the projection
already tracks that as `provenance.audit`. Pages audited by a watchlist or a
single-page target have no product and are grouped under their target, labelled
by type, rather than silently dropped.

```jsonc
// results/dashboard/products.json
{
  "generatedAt": "...",
  "products": [{
    "name": "ccip",
    "type": "product",              // watchlist and page targets appear too, labelled
    "runId": "2026-…",              // latest run, for the "open run" link
    "status": "complete",
    "at": "2026-…",
    "pages": { "audited": 37, "probed": 0, "inScope": 37 },
    "score": { "mean": 61.2, "min": 39, "max": 77 },
    // null when nothing is probed — never 0, which would read as "answers badly"
    "fidelity": { "mean": 52.6, "graders": ["claude-sonnet-5"] },
    "bands": { "Poor": 1, "Developing": 4, "Good": 28, "Strong": 4 },
    "dimensions": [
      { "name": "Answer-first extractability", "weight": 15, "mean": 7.4 }
    ]
  }]
}
```

Served at `GET /api/dashboard/products`, and `./data/products.json` in the export.

## UI

### A graph of both measures

A grouped horizontal bar per product: page quality and measured fidelity side by
side, sorted by quality ascending so the worst reads first.

They stay **two series, never a composite** — the correlation study found score
does not predict fidelity, so a combined bar would assert the disproven link.
A product with no probes shows a quality bar and an explicit "not probed"
marker rather than a fidelity bar of zero.

### "Scores per product"

One row per product: name, mean quality with band, mean fidelity with its
grader, and `audited / probed` counts. Expanding a row (`<details>`) shows the
nine dimensions averaged across that product's pages, each with its rubric
weight and a bar, sorted weakest first — that ordering is the actionable part.

Individual pages are deliberately not listed: the Pages table already does that,
and the point of this section is the aggregate. Each row links to the product's
latest run.

## Files

| file | action |
|---|---|
| `src/store/project.js` | aggregate per target, emit `products.json` |
| `src/server/index.js` | serve `/api/dashboard/products` |
| `scripts/build-public.mjs`, `src/cli.js` | copy `products.json` into the export |
| `ui/src/api/client.js` | `products()` on both transports |
| `ui/src/charts/GroupedBar.jsx` | new — two series per row |
| `ui/src/components/ProductScores.jsx` | new — the section |
| `ui/src/routes/Overview.jsx` | mount both |
| `test/store.test.js`, `ui/src/__tests__` | below |

## Acceptance criteria

- [ ] `products.json` carries one entry per target with dimension means
- [ ] Dimension means are weighted correctly — a mean of 0–10 scores, not of weighted contributions
- [ ] A product with no probed pages has `fidelity: null`, not 0
- [ ] Pages from a watchlist target are grouped under it, not dropped or mislabelled as a product
- [ ] The index does **not** gain dimensions — the byte-per-row assertion still holds
- [ ] The graph renders quality and fidelity as separate series; no composite value appears
- [ ] A product with no fidelity renders as "not probed", not a zero bar
- [ ] Every fidelity figure shown carries its grader
- [ ] Dimensions sort weakest-first and show their rubric weight
- [ ] Each product row links to its latest run
- [ ] Export contains `products.json`; the section works read-only

## Risks

| risk | mitigation |
|---|---|
| The index regains bulk via the new aggregate | Aggregate is a separate file; existing byte-per-row test unchanged |
| A product's mean is computed over pages that failed | Only pages with a parsed audit count; `audited` states the denominator |
| Mixed graders averaged into one fidelity | `graders` is an array; more than one is surfaced, as on the Overview cards |
