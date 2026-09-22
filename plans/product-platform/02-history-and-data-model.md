# 2 — Run history and a data model that scales

**Type:** ♻️ refactor + ✨ feature · **Depends on:** plan 1

## Problem

Two defects block the product, both structural.

**No history.** Every run overwrites the last — `results/<slug>/audit.md` is replaced in place. So:
routine checks cannot show drift, and "is `docs.chain.link` getting better?" is unanswerable. That
question is the reason leadership would open this at all.

**The data model does not scale — but not for the reason first assumed.** `results/dashboard-data.json`
is **272KB for 4 pages**. The first draft of this plan blamed embedded audit prose. Measured, that is
wrong:

| component | share of file |
|---|---|
| audit prose | **14.7%** |
| probe runs | **41.8%** |
| `primaryRun`, byte-identical to `probeRuns[0]` | **41.8%** — pure duplication |

[collect.js:211](../../src/dashboard/collect.js#L211) writes the same object twice. Only 2 of the 4
pages have probe runs at all; those two are 110KB and 102KB, the unprobed two are ~9KB.

Two consequences:

1. **Deleting the duplication halves the file today** — a one-line fix, independent of this plan, and
   it should land first.
2. The index/detail split must exclude **probe payloads**, not just audit prose. Stripping prose alone
   would leave ~50KB per probed page in the index and the 500-byte target could never be met.

Projection is therefore per *probed* page (~100KB today, ~50KB after the dedupe), not a flat
per-page figure. Note the corpus-wide extrapolation is bounded by cost, not bytes: auditing 1,465
pages is ~$250 and probing them far more, so the realistic ceiling is hundreds of probed pages.

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

[collect.js:268](../../src/dashboard/collect.js#L268) **already computes `gradersUsed` and
`mixedGraders`** — this is not new work, it is work to reuse and move upstream into the store.

So `timeseries.json` stores the protocol fingerprint with every point, and the trend view:

- joins points **only** within a matching grader
- renders a visible discontinuity marker where protocol changed
- never draws a single continuous line across a grader change

### Run health, not just protocol

`search_degraded_count` and `live_search_failed_count` already exist
([evaluate.js:561](../../src/evaluate.js#L561)) and already mean a run's fidelity is inconclusive.
Fingerprinting the protocol while ignoring these lets a degraded run join a trend as though it were
clean. Every timeseries point therefore carries run health, and degraded points are rendered
distinctly rather than silently averaged in.

### What may post a trend point

A **cancelled or partially failed run must never post a timeseries point.** A rollup over 7 of 31
pages is an average over a self-narrowed denominator — precisely the error the
[README](README.md) product rule forbids. Only `status: "complete"` runs post.

`manifest.status` is therefore an enumeration, not a boolean:

```
queued -> running -> complete
                  -> partial     (some pages failed; recorded, does not post a trend point)
                  -> cancelled   (user stopped it)
                  -> interrupted (process died; reconciled on next boot)
```

### Concurrency safety

`dashboard/` and `timeseries.json` are shared mutable outputs. Two runs projecting at once would
interleave into a torn index, and two "append-only" writes can lose one. All shared writes go
through **write-temp-then-rename** (atomic on POSIX), and projection takes a lockfile. Per-run
directories are already collision-free; these two shared files are not.

Structural score and fidelity are separate series. They are never averaged together (see the product
rule in the [README](README.md)).

### Index/detail split

`dashboard/index.json` holds one slim row per page and is defined by an **explicit allowlist** of
fields — slug, title, url, score, band, latest fidelity, grader, run health, last-run timestamp —
so it cannot silently regain bulk. Everything else, **including all probe payloads and audit
prose**, lives in `dashboard/pages/<slug>.json`, fetched only when that page is opened.

Target: under 500 bytes per row. The test asserts against a fixture built from **real** page titles
and URLs, not synthetic short strings — a synthetic fixture would set its own answer.

### Slug uniqueness — a real collision today

[`slugFromUrl`](../../src/probes.js#L148) takes the **last two path segments**, which collide across
products:

```
/ccip/getting-started/evm  ->  getting-started-evm
/vrf/getting-started/evm   ->  getting-started-evm     COLLISION
/ccip/guides/overview      ->  guides-overview
/cre/guides/overview       ->  guides-overview         COLLISION
```

Verified by running the real function. In a flat `dashboard/pages/<slug>.json` namespace this
silently overwrites one product's page with another's. The store must key on a **full-path slug**
(or URL hash), and must **assert uniqueness at projection time**, failing loudly on collision rather
than overwriting. Existing per-page directories keep their current names; the new namespace is
separate.

### Migration — deliberately not built

There are **six** legacy directories in `results/`. A migration module, a CLI wrapper and a test
suite to preserve them costs more than re-running them, and the imported points would be
protocol-unknown anyway (they predate `--probe-effort`; their tested-model effort is genuinely
unrecoverable, so they could never join a trend).

Legacy directories are left in place and ignored by the new store. If any are worth keeping,
re-run the target.

## Files

| file | action |
|---|---|
| `src/store/run.js` | new — write/read immutable run snapshots |
| `src/store/project.js` | new — rebuild the `dashboard/` projection from `runs/` |
| `src/store/timeseries.js` | new — append points, group by protocol fingerprint |
| `src/dashboard/collect.js` | **amend, not rewrite** — `aggregate()` (bands, hit rate, funnel, `mixedGraders`) is kept; only the emit shape changes. Delete the `primaryRun` duplication at line 211 |
| `test/store.test.js` | new |
| `test/timeseries.test.js` | new |
| `test/slug.test.js` | new — collision assertions |

## Acceptance criteria

- [ ] A run writes an immutable snapshot; a second run of the same target does not modify the first
- [ ] `dashboard/runs.json` lists every run with target, timestamp, cost, status
- [ ] Deleting `dashboard/` entirely and rebuilding reproduces it **semantically** (deep-equal ignoring `generatedAt`). Byte-for-byte is not a criterion: [resolve.js:144](../../src/product/resolve.js#L144) stamps `resolvedAt: new Date()`, so it would fail on day one
- [ ] `dashboard/index.json` is **under 500 bytes per row**, asserted against a fixture of **real** titles and URLs, and built from a field allowlist
- [ ] The index contains **no probe payloads** (assert absence of probe result keys)
- [ ] `primaryRun` duplication is gone; `dashboard-data.json` for the current corpus roughly halves
- [ ] Page detail loads from `dashboard/pages/<slug>.json`, not the index
- [ ] `timeseries.json` records a protocol fingerprint per point
- [ ] **A trend spanning two graders does not render as one continuous series** (explicit test)
- [ ] Points with unknown protocol are marked unknown, never silently joined
- [ ] Two pages whose last two path segments match get **distinct** keys, and a genuine key collision fails loudly rather than overwriting
- [ ] A `cancelled` or `partial` run posts **no** timeseries point
- [ ] Timeseries points carry run health; degraded runs are distinguishable
- [ ] Concurrent projections cannot tear the index (atomic rename + lock, asserted)
- [ ] Structural score and fidelity are stored as separate series and never averaged together
- [ ] `npm test` passes

## Risks

| risk | mitigation |
|---|---|
| Trend lines mix graders and invent improvement | Fingerprint per point; test forbids joining across graders |
| Disk growth from immutable runs | Runs are small once audit prose is deduped; add `geo-audit prune --keep-last N` if it bites. Measure before optimising |
| Migration corrupts existing results | Write-only to new paths; originals untouched until verified; idempotent |
| Index creeps back toward embedding payloads | Field allowlist + byte-per-row assertion + explicit no-probe-payload assertion |
| Slug collisions silently overwrite pages | Full-path key; uniqueness asserted at projection time |

## Out of scope

Serving, UI. Plan 2 produces files on disk; plans 3–5 consume them.
