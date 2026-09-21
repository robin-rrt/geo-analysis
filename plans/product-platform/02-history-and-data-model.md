# 2 — Run history and a data model that scales

**Type:** ♻️ refactor + ✨ feature · **Depends on:** plan 1

## Problem

Two defects block the product, both structural.

**No history.** Every run overwrites the last — `results/<slug>/audit.md` is replaced in place. So:
routine checks cannot show drift, and "is `docs.chain.link` getting better?" is unanswerable. That
question is the reason leadership would open this at all.

**The data model does not scale.** `results/dashboard-data.json` is **272KB for 4 pages** because it
embeds full audit content per page. Per-product coverage means hundreds of pages:

| pages | projected dashboard-data.json |
|---|---|
| 4 | 272 KB *(actual today)* |
| 100 | ~7 MB |
| 1,465 | ~100 MB |

A browser cannot load that, and a static export cannot contain it.

## Solution

### Immutable run snapshots

A run is an append-only, immutable record. Nothing is ever overwritten.

```
results/
  runs/
    2026-09-18T14-22-05Z-a3f9/          # runId: ISO instant + short hash
      manifest.json                      # scope, stages, protocol, cost, timing, status
      pages/<slug>/audit.md
      pages/<slug>/checks.json
      pages/<slug>/probes.json
      pages/<slug>/probe-results-<model>-<mode>.json
      rollup.json
  dashboard/                             # derived projections — rebuildable from runs/ at any time
    index.json                           # slim: one row per page — no audit bodies
    pages/<slug>.json                    # detail, fetched on demand
    runs.json                            # one row per run — id, target, when, headline figures
    timeseries.json                      # per-target score/fidelity over time (append-only)
```

Two directories, not three: `runs/` is the source of truth and `dashboard/` is a pure projection
of it. Anything in `dashboard/` can be deleted and rebuilt, which makes the static export of plan 5
a copy rather than a separate build path.

`manifest.json` records the **protocol**, because comparing across runs is invalid without it:

```json
{
  "runId": "2026-09-18T14-22-05Z-a3f9",
  "target": { "type": "product", "name": "vrf", "productScope": "curated", "pageCount": 12 },
  "stages": ["audit", "probes", "test", "rollup"],
  "protocol": {
    "analystModel": "claude-opus-4-8", "analystEffort": "high",
    "graderModel": "claude-sonnet-5", "probeModel": "claude-opus-4-8",
    "probeEffort": "medium", "mode": "web", "batch": true
  },
  "cost": { "measured": 18.24, "currency": "USD" },
  "status": "complete"
}
```

### Comparability is enforced, not assumed

The grader bias is real and measured: **Sonnet grades ~12 points harsher than Opus**, mean signed
−12.1. A trend line mixing them shows a 12-point "improvement" that is purely a model swap.

So `timeseries.json` stores the protocol fingerprint with every point, and the trend view:

- joins points **only** within a matching grader
- renders a visible discontinuity marker where protocol changed
- never draws a single continuous line across a grader change

Structural score and fidelity are separate series. They are never averaged together (see the product
rule in the [README](README.md)).

### Index/detail split

`dashboard/index.json` holds one slim row per page — slug, title, score, band, latest fidelity,
last-run timestamp — and **no audit prose**. Target: under 500 bytes per page, so 1,465 pages is
~700KB, acceptable and paginable. Full audit text lives in `dashboard/pages/<slug>.json`, fetched
only when a user opens that page.

### Migration

Existing `results/<slug>/` directories are imported as one historical run, dated from file mtime,
with `protocol: { ...unknown fields null }`. Unknown protocol is recorded honestly as unknown —
those runs predate `--probe-effort` and their tested-model effort genuinely is not recoverable. The
UI must show such points as protocol-unknown rather than silently joining them to a trend.

`scripts/migrate-results.mjs` is idempotent and writes to `results/runs/` without deleting the
originals until verified.

## Files

| file | action |
|---|---|
| `src/store/run.js` | new — write/read immutable run snapshots |
| `src/store/project.js` | new — rebuild the `dashboard/` projection from `runs/` |
| `src/store/timeseries.js` | new — append points, group by protocol fingerprint |
| `src/store/migrate.js` | new — import legacy `results/<slug>/` |
| `scripts/migrate-results.mjs` | new — CLI wrapper, idempotent |
| `src/dashboard/collect.js` | rewrite — emit index + detail instead of one blob |
| `test/store.test.js` | new |
| `test/timeseries.test.js` | new |
| `test/migrate.test.js` | new |

## Acceptance criteria

- [ ] A run writes an immutable snapshot; a second run of the same target does not modify the first
- [ ] `dashboard/runs.json` lists every run with target, timestamp, cost, status
- [ ] Deleting `dashboard/` entirely and rebuilding reproduces it byte-for-byte from `runs/`
- [ ] `dashboard/index.json` is **under 500 bytes per page** (assert in test with a synthetic 200-page fixture)
- [ ] Page detail loads from `dashboard/pages/<slug>.json`, not the index
- [ ] `timeseries.json` records a protocol fingerprint per point
- [ ] **A trend spanning two graders does not render as one continuous series** (explicit test)
- [ ] Points with unknown protocol are marked unknown, never silently joined
- [ ] Migration imports existing results, is idempotent, and leaves originals intact
- [ ] Structural score and fidelity are stored as separate series and never averaged together
- [ ] `npm test` passes

## Risks

| risk | mitigation |
|---|---|
| Trend lines mix graders and invent improvement | Fingerprint per point; test forbids joining across graders |
| Disk growth from immutable runs | Runs are small once audit prose is deduped; add `geo prune --keep-last N` if it bites. Measure before optimising |
| Migration corrupts existing results | Write-only to new paths; originals untouched until verified; idempotent |
| Index creeps back toward embedding prose | Byte-per-page assertion in CI |

## Out of scope

Serving, UI. Plan 2 produces files on disk; plans 3–5 consume them.
