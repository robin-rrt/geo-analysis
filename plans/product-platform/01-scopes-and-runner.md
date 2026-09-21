# 1 — Targets and the one-command runner

**Type:** ✨ feature · **Depends on:** nothing · **Unlocks:** every other plan

## Problem

Five primitives, run by hand, in the right order, with the right flags:

```bash
node src/cli.js score <url>
node src/cli.js gen-probes <url> -n 6 -o probes.json
node src/cli.js probe probes.json -m claude-opus-4-8 --mode web --batch
node src/cli.js dashboard
```

Nobody outside this repo will do that correctly. There is also no way to say "check these ten pages"
without ten invocations, and no way to know what a run will cost before it starts.

## Solution

One command with an explicit target and optional stage selection:

```bash
geo run product:vrf                      # resolve → audit → probes → test → roll up
geo run watchlist:release-critical      # a curated set
geo run page:https://docs.chain.link/ace  # a single page
geo run product:ccip --stages audit      # granular: audit only
geo run product:vrf --estimate           # print projected cost and exit
```

### The target abstraction

> **Naming, decided deliberately.** The codebase already uses `scope` to mean *breadth within a
> product* — `curated | full | bundle` — across
> [resolve.js:72](../../src/product/resolve.js#L72), `fetch.js`, `audit.js` and
> [rollup.js:160](../../src/product/rollup.js#L160). Reusing `scope` for *what to run against*
> would collide, and worse, `curated` would mean two different things on two different axes.
> So the new concept is **target**, and the watchlist prefix is `watchlist:` not `curated:`.
> The existing `scope` keeps its current meaning, untouched.

A **target** resolves into a page list; everything downstream is identical regardless of type.

```js
// src/target/index.js
/**
 * @typedef {object} ResolvedTarget
 * @property {"product"|"watchlist"|"page"} type
 * @property {string} name
 * @property {string|null} productScope   // curated|full|bundle — only for type "product"
 * @property {PageRef[]} pages
 * @property {LedgerEntry[]} ledger       // what was considered and why it was kept or dropped
 */
export async function resolveTarget(spec) { /* dispatch on the "type:" prefix */ }
```

| type | spec | resolver | notes |
|---|---|---|---|
| `product` | `product:vrf` | wraps existing [src/product/resolve.js](../../src/product/resolve.js) | llms.txt / sitemap; passes through `--product-scope curated\|full\|bundle` |
| `watchlist` | `watchlist:<name>` | new, ~50 lines | reads `watchlists/<name>.json` |
| `page` | `page:<url>` | trivial | one page |

**Why the watchlist type is cheap:** it produces the same `ResolvedTarget` shape, so audit, probes,
rollup, history and UI need no knowledge of it.
[src/product/rollup.js](../../src/product/rollup.js) already scores a set of pages generically.

**Dropped from this plan: a `sitemap:<glob>` target type.** Re-reading the requirement — *"picking a
product or just a page (maybe figured out from the sitemap)"* — what is wanted is **sitemap-backed
autocomplete when choosing a single page**, not a glob target. `product:` already resolves through
the sitemap, so a glob type would have been a near-duplicate. The picker in plan 4 satisfies the
requirement directly; `GET /api/targets` (plan 3) exposes sitemap URLs for that autocomplete.

### Watchlist format

```json
// watchlists/release-critical.json
{
  "name": "release-critical",
  "description": "Pages that must be correct before any release",
  "pages": [
    "https://docs.chain.link/vrf/v2-5/getting-started",
    "https://docs.chain.link/ccip/getting-started/evm"
  ]
}
```

### Stages

Each stage is skippable and resumable. `--stages` takes a comma list; default is all.

| stage | does | reuses |
|---|---|---|
| `resolve` | target → page list + ledger | `src/product/resolve.js` |
| `audit` | per-page score + measured facts | `cmdScore` |
| `probes` | generate probe sets | `cmdGenProbes` |
| `test` | run probes, grade | `cmdProbe` |
| `rollup` | aggregate to target level | `src/product/rollup.js` |

Resumability is not optional: a `test` stage can run 40 minutes, and re-running a whole target
because one page failed is unacceptable. Reuse the existing artifact-exists check, **corrected** —
`experiments/correlation/run-stage.mjs` learned the hard way that a probe run writes its answers
before grading returns, so "file exists" is not "stage complete". Completion must be asserted from
content (`graded_count > 0`), not existence.

### Cost preflight

```
$ geo run product:ccip --estimate

  target     product:ccip (product scope: curated) — 31 pages
  stages     audit, probes, test, rollup

  audit      31 pages x $0.17                    $5.27
  probes     31 sets x 6 x $0.06                 $11.16
  test       186 probes x $0.42 (web)            $78.12
  ----------------------------------------------------
  projected                                     $94.55   ± 30%

  Estimates come from measured per-unit costs (see README). Batch grading (--batch)
  reduces grader cost by 50%; the model under test is unaffected.
```

`geo run` prints this and requires `--yes` above a threshold (default $10, `GEO_COST_CEILING`).

## Files

| file | action |
|---|---|
| `src/target/index.js` | new — `resolveTarget`, dispatch |
| `src/target/product.js` | new — thin wrapper over existing product resolver |
| `src/target/watchlist.js` | new — watchlist reader + validation |
| `src/run/pipeline.js` | new — stage sequencing, resume, concurrency |
| `src/run/estimate.js` | new — cost projection from measured unit costs |
| `src/cli.js` | add `run` subcommand; existing five stay for granular use |
| `watchlists/release-critical.json` | new — example watchlist |
| `test/target.test.js` | new |
| `test/pipeline.test.js` | new |
| `test/estimate.test.js` | new |

## Acceptance criteria

- [ ] `geo run product:vrf` completes end to end and writes a rollup
- [ ] `geo run watchlist:<name>` works with **no** code path that special-cases it downstream of `resolveTarget`
- [ ] `geo run page:<url>` works for a single page
- [ ] `--product-scope full` still reaches the existing resolver unchanged — the new `target` concept does not shadow or rename the existing `scope`
- [ ] `--stages audit` runs only the audit stage; `--stages probes,test` runs only those
- [ ] Re-running a completed target re-does no paid work
- [ ] **Stage completion is determined by content, not file existence** (regression test: a run file with `graded_count: 0` must not count as complete)
- [ ] `--estimate` prints a projection and makes no API call
- [ ] A run projected above the ceiling refuses to start without `--yes`
- [ ] A failed page does not abort the run; it is reported in the ledger with a reason
- [ ] Ledger records every URL considered and why it was kept or dropped
- [ ] `npm test` passes

## Risks

| risk | mitigation |
|---|---|
| Target abstraction leaks and `product` gets hard-coded downstream | Acceptance criterion forbids it; `watchlist` ships in the same PR to prove the seam |
| Resume logic marks incomplete work complete | Assert on content; explicit regression test (this already bit us once) |
| Cost estimates drift from reality | Estimates read from one constants module, updated from measured runs; `±30%` shown, never a false-precision figure |
| Long runs lose work on crash | Artifacts written per page as they complete, never only at the end |

## Out of scope

Server, UI, history storage. Plan 1 writes to the existing `results/` layout; plan 2 migrates it.
A `sitemap:<glob>` target type, deferred as above.
