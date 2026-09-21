# 3 — Local server and job execution

**Type:** ✨ feature · **Depends on:** plans 1, 2

## Problem

Triggering a run from a browser needs a process that can start jobs and report progress. Two
properties of this workload rule out naive request/response:

- **Runs are long.** Measured in the correlation study: web probe runs took **685–2,360 seconds**.
  Batch grading adds 10–40 minutes on top. No HTTP request survives that.
- **Runs cost money.** A careless click can spend $250.

## Solution

`geo serve` — a small Node server, no framework, serving the built UI and exposing a job API.

```bash
geo serve                 # http://127.0.0.1:4317
geo serve --port 8080
```

### Security posture — the part not to get wrong

Per the locked decision, **this server is never the thing on the public domain.** The public
artifact is the static export from plan 5, which has no API and cannot start a job.

Enforced, not merely documented:

1. **Binds `127.0.0.1` by default.** Not `0.0.0.0`.
2. Binding a non-loopback interface requires `--expose` *and* prints a warning naming the risk:
   anyone who can reach the port can spend the Anthropic budget.
3. **The API key never reaches the browser.** It stays in the server process; no endpoint echoes it;
   it is redacted from all job logs and error payloads.
4. No endpoint accepts an arbitrary shell command. The API takes a scope target and a stage list,
   both validated against the scope resolver — never interpolated into a shell.
5. Cost ceiling enforced server-side. A client cannot bypass it by crafting a request.

### API

| method | path | purpose |
|---|---|---|
| `GET` | `/api/targets` | resolvable targets — products, watchlists, sitemap sections |
| `POST` | `/api/estimate` | `{target, stages}` → projected cost, no API call made |
| `POST` | `/api/runs` | start a run; **400 unless `acknowledgedCost` matches the server's estimate** |
| `GET` | `/api/runs` | run history (from `index/runs.json`) |
| `GET` | `/api/runs/:id` | status, per-page progress, cost so far |
| `GET` | `/api/runs/:id` | polled for progress (see below) |
| `POST` | `/api/runs/:id/cancel` | cancel; in-flight page finishes, nothing new starts |
| `GET` | `/api/dashboard/index` | slim index (plan 2) |
| `GET` | `/api/dashboard/pages/:slug` | page detail |

`acknowledgedCost` is the guardrail that makes the confirm dialog meaningful: the client must send
back the figure it showed the user. If the server's estimate has changed, it refuses — so the user
cannot approve $9 and trigger $200.

### Progress via polling, not SSE

**Revised down from an SSE design.** An SSE broker needs a connection registry, heartbeats,
reconnection handling and its own failure mode where the UI looks frozen because the stream died
silently. For one user on localhost watching a job that takes 7–40 minutes, polling
`GET /api/runs/:id` every 2 seconds is indistinguishable in experience and deletes all of that.
`@tanstack/react-query`'s `refetchInterval` (plan 4) does it in one line.

`GET /api/runs/:id` returns the whole progress picture, read from the job's on-disk state:

```json
{
  "runId": "…", "status": "running",
  "stage": "audit",
  "pages": { "complete": 7, "failed": 0, "total": 31 },
  "recent": [{ "slug": "vrf-getting-started", "stage": "audit", "status": "ok", "cost": 0.17 }],
  "cost": { "spent": 4.21, "projected": 94.55 }
}
```

Running cost matters here: a user watching $4 climb toward $90 can cancel. Because state is read
from disk rather than memory, a poll after a server restart still returns the truth.

### Job persistence

Job state lives on disk (`results/runs/<id>/manifest.json`), not in memory, so a server restart does
not lose a 40-minute run. On boot, any run left `running` is reconciled: completed pages are
detected from artifacts (by content, per plan 1), and the run is marked `interrupted` rather than
silently resumed — resuming automatically could double-spend.

Concurrency is capped (default 3, `GEO_CONCURRENCY`), matching what the study used comfortably.

## Files

| file | action |
|---|---|
| `src/server/index.js` | new — HTTP server, routing, static file serving |
| `src/server/api.js` | new — endpoint handlers |
| `src/server/jobs.js` | new — job lifecycle, queue, cancellation, reconciliation |
| `src/server/redact.js` | new — strip secrets from logs/errors |
| `src/cli.js` | add `serve` subcommand |
| `test/server-api.test.js` | new |
| `test/jobs.test.js` | new |
| `test/redact.test.js` | new |

## Acceptance criteria

- [ ] `geo serve` binds `127.0.0.1` by default; asserted in test
- [ ] Binding externally requires `--expose` and prints the budget warning
- [ ] **No response body or log line ever contains the API key** (test feeds a known key and greps all output)
- [ ] `POST /api/runs` returns 400 when `acknowledgedCost` does not match the server estimate
- [ ] Cost ceiling is enforced server-side and cannot be bypassed by a crafted request
- [ ] Target and stage inputs are validated against the resolver; no shell interpolation anywhere
- [ ] `GET /api/runs/:id` reports stage, per-page progress and running cost, read from disk
- [ ] Cancel stops new work; the in-flight page completes rather than corrupting an artifact
- [ ] Killing and restarting the server leaves a running job marked `interrupted`, not lost or double-spent
- [ ] Concurrency cap is respected
- [ ] `npm test` passes

## Risks

| risk | mitigation |
|---|---|
| Server reachable publicly and burns budget | Loopback default; `--expose` opt-in with warning; public artifact is the static export, which has no API |
| Secret leaks via an error payload | Central redaction; test greps every output for a planted key |
| Restart double-spends | Interrupted, never auto-resumed; completion asserted from content |
| Runaway concurrent runs | Server-side cap and ceiling |
| UI looks frozen if a poll fails | Polling retries by default; last-updated timestamp shown so staleness is visible |

## Out of scope

Authentication and multi-user — excluded by the locked deployment decision. If the split model ever
changes to a hosted app, auth, per-user budgets and secret storage become their own plan. Do not
half-build it now.
