# 1 — Scopes and the one-command runner

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
geo run curated:release-critical         # a watchlist
geo run page:https://docs.chain.link/ace # a single page
geo run product:ccip --stages audit      # granular: audit only
geo run product:vrf --estimate           # print projected cost and exit
```

### The scope abstraction

One idea makes both product and curated cheap, and is the reason to build it first. A **scope**
resolves a target string into a page list; everything downstream is identical regardless of type.

```js
// src/scope/index.js
/**
 * @typedef {object} Scope
 * @property {"product"|"curated"|"page"|"sitemap"} type
 * @property {string} name
 * @property {PageRef[]} pages
 * @property {LedgerEntry[]} ledger   // what was considered and why it was kept or dropped
 */
export async function resolveScope(target) { /* dispatch on the "type:" prefix */ }
```

| type | target | resolver | notes |
|---|---|---|---|
| `product` | `product:vrf` | wraps existing [src/product/resolve.js](../../src/product/resolve.js) | llms.txt / sitemap, three scopes already built |
| `curated` | `curated:<name>` | new, ~50 lines | reads `watchlists/<name>.json` |
| `page` | `page:<url>` | trivial | one page |
| `sitemap` | `sitemap:<glob>` | new, ~40 lines | e.g. `sitemap:/vrf/**` — satisfies "figured out from the sitemap" |

**Why curated is cheap here:** it produces the same `Scope` shape, so audit, probes, rollup, history
and UI need no knowledge of it. [src/product/rollup.js](../../src/product/rollup.js) already scores a
set of pages generically.

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
| `rollup` | aggregate to scope level | `src/product/rollup.js` |

Resumability is not optional: a `test` stage can run 40 minutes, and re-running a whole scope
because one page failed is unacceptable. Reuse the existing artifact-exists check, **corrected** —
`experiments/correlation/run-stage.mjs` learned the hard way that a probe run writes its answers
before grading returns, so "file exists" is not "stage complete". Completion must be asserted from
content (`graded_count > 0`), not existence.

### Cost preflight

```
$ geo run product:ccip --estimate

  scope      product:ccip (curated) — 31 pages
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
| `src/scope/index.js` | new — `resolveScope`, dispatch |
| `src/scope/product.js` | new — thin wrapper over existing product resolver |
| `src/scope/curated.js` | new — watchlist reader + validation |
| `src/scope/sitemap.js` | new — glob against sitemap |
| `src/run/pipeline.js` | new — stage sequencing, resume, concurrency |
| `src/run/estimate.js` | new — cost projection from measured unit costs |
| `src/cli.js` | add `run` subcommand; existing five stay for granular use |
| `watchlists/release-critical.json` | new — example watchlist |
| `test/scope.test.js` | new |
| `test/pipeline.test.js` | new |
| `test/estimate.test.js` | new |

## Acceptance criteria

- [ ] `geo run product:vrf` completes end to end and writes a rollup
- [ ] `geo run curated:<name>` works with **no** code path that special-cases curated downstream of `resolveScope`
- [ ] `geo run sitemap:/vrf/**` resolves pages from the sitemap
- [ ] `geo run page:<url>` works for a single page
- [ ] `--stages audit` runs only the audit stage; `--stages probes,test` runs only those
- [ ] Re-running a completed scope re-does no paid work
- [ ] **Stage completion is determined by content, not file existence** (regression test: a run file with `graded_count: 0` must not count as complete)
- [ ] `--estimate` prints a projection and makes no API call
- [ ] A run projected above the ceiling refuses to start without `--yes`
- [ ] A failed page does not abort the scope; it is reported in the ledger with a reason
- [ ] Ledger records every URL considered and why it was kept or dropped
- [ ] `npm test` passes

## Risks

| risk | mitigation |
|---|---|
| Scope abstraction leaks and `product` gets hard-coded downstream | Acceptance criterion forbids it; curated is implemented in the same PR to prove the seam |
| Resume logic marks incomplete work complete | Assert on content; explicit regression test (this already bit us once) |
| Cost estimates drift from reality | Estimates read from one constants module, updated from measured runs; `±30%` shown, never a false-precision figure |
| Long runs lose work on crash | Artifacts written per page as they complete, never only at the end |

## Out of scope

Server, UI, history storage. Plan 1 writes to the existing `results/` layout; plan 2 migrates it.
