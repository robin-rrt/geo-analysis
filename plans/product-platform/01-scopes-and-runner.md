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
geo-audit run product:vrf                      # resolve → audit → probes → test → roll up
geo-audit run watchlist:release-critical      # a curated set
geo-audit run page:https://docs.chain.link/ace  # a single page
geo-audit run product:ccip --stages audit      # granular: audit only
geo-audit run product:vrf --estimate           # print projected cost and exit
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

### Watchlist format and validation

```json
// watchlists/release-critical.json
{
  "version": 1,
  "name": "release-critical",
  "description": "Pages that must be correct before any release",
  "pages": [
    "https://docs.chain.link/vrf/v2-5/getting-started",
    "https://docs.chain.link/ccip/getting-started/evm"
  ]
}
```

Validation rules, so "reader + validation" means something specific: `version` must be known;
duplicate URLs are rejected; off-origin URLs are rejected (a watchlist pointing at another domain is
a mistake, not a feature); URLs that 404 at resolve time are kept in the ledger with a reason rather
than silently dropped.

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
because one page failed is unacceptable. But "file exists" is not "stage complete" — a probe run
writes its answers before grading returns (`experiments/correlation/run-stage.mjs` learned this the
hard way).

**The completion predicate, stated correctly.** `graded_count > 0` is also wrong — it marks a page
complete when 1 of 6 probes graded. And `graded_count === probe_count` is wrong too, because
refusals and errors are legitimately ungraded
([evaluate.js:555](../../src/evaluate.js#L555)). The predicate is:

```js
const settled = graded_count + refusal_count + error_count === probe_count;
// refusals are terminal — the model declined, re-running burns money for the same answer.
// errors are retryable — they are transport failures, not verdicts.
const complete = settled && error_count === 0;
```

**Stage inputs are hashed.** A page audited at t=0 and probed at t=40min may have changed in
between, which would score an answer against stale text.
[`changedSince`](../../src/product/fetch.js#L81) already exists for this; each stage records the
content hash it consumed, and a resumed run re-does a stage whose input hash moved.

### Reuse, don't re-derive

[`cmdProduct`](../../src/cli.js#L521) is already the end-to-end pipeline — resolve, fetch, ledger,
rollup, with `--audit` and `--probes`. `src/run/pipeline.js` **extends** it with stage selection,
resume and multi-target support; it does not reimplement it.
[`writeLedger`](../../src/product/fetch.js#L102) already produces the ledger this plan describes.

### Cost preflight

```
$ geo-audit run product:ccip --estimate

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

`geo-audit run` prints this and requires `--yes` above a threshold (default $10, `GEO_COST_CEILING`).

Deliberately **not** built: the three-way `acknowledgedCost` handshake an earlier draft specified.
A page count, a projected figure and `--yes`, with the ceiling enforced server-side in plan 3, is
the whole feature. A consensus protocol between one user and their own laptop is not.

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

- [ ] `geo-audit run product:vrf` completes end to end and writes a rollup
- [ ] `geo-audit run watchlist:<name>` works with **no** code path that special-cases it downstream of `resolveTarget`
- [ ] `geo-audit run page:<url>` works for a single page
- [ ] `--product-scope full` still reaches the existing resolver unchanged — the new `target` concept does not shadow or rename the existing `scope`
- [ ] `--stages audit` runs only the audit stage; `--stages probes,test` runs only those
- [ ] Re-running a completed target issues **zero Anthropic requests** — asserted with an injected client that counts calls, not by inspection
- [ ] **Completion is `graded + refusals + errors === probe_count` with `error_count === 0`** — regression tests for: `graded_count: 0` (incomplete), 1-of-6 graded (incomplete), 5 graded + 1 refusal (complete), 5 graded + 1 error (incomplete, retryable)
- [ ] A stage whose input content hash changed is re-run, not skipped
- [ ] `--estimate` makes **no Anthropic API call**; it may fetch llms.txt/sitemap, which is how page count is known ([resolve.js:83](../../src/product/resolve.js#L83))
- [ ] A run projected above the ceiling refuses to start without `--yes`
- [ ] A failed page does not abort the run; it is reported in the ledger with a reason
- [ ] Ledger records every URL considered and why it was kept or dropped (via existing `writeLedger`)
- [ ] Watchlist validation rejects unknown `version`, duplicate URLs and off-origin URLs
- [ ] `npm test` passes

## Risks

| risk | mitigation |
|---|---|
| Target abstraction leaks and `product` gets hard-coded downstream | Acceptance criterion forbids it; `watchlist` ships in the same PR to prove the seam |
| Resume logic marks incomplete work complete | Assert on content; explicit regression test (this already bit us once) |
| Cost estimates drift from reality | Estimates read from one constants module, updated from measured runs; `±30%` shown, never a false-precision figure |
| Long runs lose work on crash | Artifacts written per page as they complete, never only at the end |

## Known limitation until plan 2

Plan 1 writes to the existing `results/<slug>/` layout, which **overwrites in place**. This was
confirmed the hard way during implementation: a single end-to-end verification run replaced a
committed `results/ace/audit.md` (restored from git).

Until plan 2's immutable run snapshots land, `geo-audit run` destroys the previous audit for any
page it touches. Mitigation for now: `--estimate` is free and safe, and `results/` is under version
control so an overwrite is recoverable. This is the strongest argument for doing plan 2 next.

## Out of scope

Server, UI, history storage. Plan 2 replaces the overwrite-in-place layout.
A `sitemap:<glob>` target type, deferred as above.
