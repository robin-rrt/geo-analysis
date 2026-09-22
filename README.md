# geo-analysis

`geo-audit` — a CLI that measures **Generative Engine Optimization (GEO)** for documentation
pages: how likely a page is to be retrieved, cited, and accurately synthesized by generative
engines (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews) and by coding agents that
read docs to complete tasks.

It works at two scales: a single page, or a whole **product** resolved from the site's own
`llms.txt` index and sitemap. One command runs the whole thing; a local server and a React
dashboard sit on top for people who would rather not use a terminal.

```bash
geo-audit run product:vrf          # resolve -> audit -> probes -> test -> roll up
geo-audit run product:ccip --estimate   # what would that cost? (free, no API call)
geo-audit serve                    # dashboard + start runs from the browser (localhost)
geo-audit dashboard --export pub/  # read-only bundle to publish on a domain
```

| Command | What it does | Output |
|---|---|---|
| **`run <target>`** | Runs every stage end to end over a `product:`, `watchlist:` or `page:` target. Stage-selectable, resumable, and refuses to start above a cost ceiling | An immutable run snapshot under `results/runs/<runId>/` |
| **`serve`** | Serves the dashboard and starts runs from the browser. **Loopback only** | `http://127.0.0.1:4317` |
| `score <url>` | Audits one page against a weighted GEO rubric | Scored Markdown report (0–100, 9 dimensions, prioritized fixes) |
| `gen-probes <url>` | Generates realistic developer prompts the page should be the canonical answer to, with a source-grounded answer key. Each probe declares a `context_mode` (see below). Skips pages whose content is unchanged | `probes.json` |
| `probe <probes.json>` | Asks a model-under-test each probe (web retrieval on by default), then grades every answer against the source as sole ground truth. Resumes where an interrupted run stopped | `probe-results-<model>-<mode>.json` + `probe-matrix.csv` |
| **`product <name>`** | Resolves a product's pages, fetches them, and rolls up deterministic checks — **no API calls**. `--audit` adds one LLM audit over the aggregate; `--probes` generates product-scoped probes | `pages.json`, `rollup.json`, `audit.md`, `probes.json` |
| `dashboard` | Rolls every artifact in `results/` into one shareable HTML report | `dashboard.html` |
| **`dashboard --export <dir>`** | Publishes the read-only static bundle — a single self-contained HTML file plus sibling JSON | `index.html` + `data/` |

**Cost is measured, not estimated.** Every run records what it actually spent
([src/usage.js](src/usage.js)). Measured on `docs.chain.link`:

| operation | cost |
|---|---|
| one page audit | **$0.17** |
| a 10-product sweep, audit only (196 pages) | **~$21** |
| grading 244 probes, web mode (43 pages) | **$80.31** |
| re-grading those same stored answers | **$5.40** |

The shape matters more than the figures: **auditing is cheap, probing is not.** Breadth costs
tens of dollars; measuring how engines answer costs roughly $2 a page. Prices are a cached
constant carrying the date they were checked, and an unpriced model yields `null` rather than a
wrong number.

**Model defaults are tiered by job.** The analyst (`score`, `gen-probes`) runs on **Opus 4.8**,
escalating to **Fable 5** at `--effort max`. The **grader defaults to Sonnet 5** — grading is
constrained work (fixed source, answer key, four scores) that does not need the analyst tier.
The model under test defaults to Opus 4.8 at `--probe-effort medium`.

The `probe` grader catches the hallucinations that matter most for developer docs: fabricated
function names, wrong import/package paths, invented params, deprecated APIs, out-of-order
steps. It judges content only, and is blind to which model wrote the answer, so answers from
different models are graded on the same footing.

> ### ⚠️ Fidelity is grader-relative
>
> Re-grading 20 stored answers with both graders: **Sonnet scores ~12 points harsher than Opus**
> (mean absolute delta 12.6, mean signed −12.1, only 8 of 20 within 10 points). The bias is
> systematic rather than random and **ranking is preserved**, so Sonnet is a usable instrument on
> a shifted scale. But a Sonnet-graded fidelity is **not comparable** with an Opus-graded one.
> Every run records `grader_model`, and the dashboard warns when a corpus mixes graders instead
> of silently averaging two scales. Use `--grader-model` to pin one.

**Retrieval is decided in code, not by the grader** ([src/retrieval.js](src/retrieval.js)): a hit
is a cited URL that matches the expected source once normalised (scheme, `www.`, trailing slash,
`.md` twin, query and fragment ignored), or the source named in the answer text without a scheme
— `via` records which. At product scope the verdict is a **tier** — `exact` (the expected page),
`in-scope` (another page of the same product), `out-of-scope`, or `none` — while `hit` stays true
only for `exact`, so page and product runs remain comparable. Fidelity is likewise arithmetic,
`round(2.5 × Σ scores)`. A refusal is recorded and not graded; in `closed` mode there is no
retrieval to hit, so the verdict is `null`, never a miss. Each result carries the tokens it cost,
split between model-under-test and grader.

> ### Fidelity covers answers that found the subject
>
> The grader first decides `subject_identified`. An answer that engages this product and gets the
> details wrong is a low accuracy score — the docs are unclear. An answer about a *different
> subject* is not a score at all: retrieval failed and the model answered something else.
>
> The two have opposite fixes — rewrite the prose, versus make the page findable — so
> `avg_fidelity` covers attributed answers only, with `avg_fidelity_all` and `unattributed_count`
> reported alongside so the filtering is auditable. Runs graded before this existed are treated as
> attributed, so no historical trend silently re-bases.
>
> Measured on a 43-page CRE run: **26% of answers had never identified the subject**, and 91% of
> those cited nothing at all. Including them reported 42.8 where the attributed figure is 52.6.

Cited URLs count both API citation blocks and links embedded in the answer body. Probes whose
web search got rate-limited are retried with backoff; if degradation persists they're flagged
`search_degraded`. Each result also records `searches_attempted`/`searches_succeeded`; a probe
that searched but got zero results is flagged `live_search_failed`, and the run summary prints
a WARNING when live search didn't work reliably. Misses from degraded/failed-search probes are
inconclusive — excluded from `retrieval_hit_rate_effective` (raw `retrieval_hit_rate` is still
reported alongside `inconclusive_miss_count`).

## Setup

```sh
npm install
```

Auth resolves from `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or an `ant auth login`
profile. Alternatively, put the key in a repo-local `.env` (gitignored):

```sh
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
```

## Usage

Every command writes its artifact to `results/<page-slug>/` (relative to the working
directory), so the audit, probes, and probe results for one page live side by side:

```
results/<slug>/
  audit.md                             score
  audit-probe-informed.md              score --probe-results
  probes.json                          gen-probes
  probe-results-<model>-<mode>.json    probe
  probe-matrix.csv                     probe, dashboard — probes × models

results/products/<product>/
  pages.json                           product — the ledger: every page, included or why not
  rollup.json                          product — deterministic checks + points recoverable
  audit.md                             product --audit
  probes.json                          product --probes
  probe-results-<model>-<mode>.json    probe
```

`probes.json` records a `source_hash` (the page content it was built from) and a `probe_set_id`
(the probes themselves). Runs are only comparable within one probe set: `gen-probes` does
nothing when the content is unchanged, `probe` resumes only a run that answered the same set
with the same model, mode, and grader, and the dashboard marks runs on an older set as stale
rather than mixing them in.

`-o <file>` overrides the destination for any command.

```sh
# 1. Score a page (streams live AND saves to results/<slug>/audit.md)
node src/cli.js score https://docs.chain.link/data-feeds

# 2. Generate 10 probe prompts + answer key -> results/<slug>/probes.json
node src/cli.js gen-probes https://docs.chain.link/data-streams/tutorials/go-sdk-fetch

# 3. Run the probes and grade -> results/<slug>/probe-results-opus-4-8-web.json
node src/cli.js probe results/tutorials-go-sdk-fetch/probes.json --model claude-opus-4-8
node src/cli.js probe results/tutorials-go-sdk-fetch/probes.json --mode closed  # parametric baseline

#    Interrupted? Re-run the same command: answered probes are kept, and only the
#    missing or failed ones are asked again. -f/--force re-runs everything.

# 4. Close the loop: re-score with the probe run so the audit includes the
#    probe-informed diagnosis -> results/<slug>/audit-probe-informed.md
node src/cli.js score https://docs.chain.link/data-streams/tutorials/go-sdk-fetch \
  --probe-results results/tutorials-go-sdk-fetch/probe-results-opus-4-8-web.json

# 5. Or work at product scope — steps 1-3 for a whole product at once
node src/cli.js product vrf --list          # what would be assessed (no API calls)
node src/cli.js product vrf --audit         # deterministic rollup + one LLM audit
node src/cli.js product vrf --probes -n 10  # product-scoped probes
node src/cli.js probe results/products/vrf/probes.json

# 6. Roll everything in results/ into one shareable HTML report (no API calls)
node src/cli.js dashboard

# Inspect what gets sent to the auditor (no API call)
node src/cli.js score https://docs.chain.link/data-feeds --dump-content
```

## Dashboard

`dashboard` reads `results/` and writes a single self-contained `results/dashboard.html` —
no server, no external requests, no dependencies. Open it with `file://` or send the file to
someone who never ran the tool.

Five views: **Overview** (corpus KPIs, the score-vs-fidelity gap chart, all pages, weakest
dimensions), **Pages** (per-page scorecard / recommendations / probes / anti-patterns),
**Products** (deterministic score, curated coverage, checks, points-recoverable fixes, and where
probe answers actually pointed), **Answer quality** (what retrieval is worth, retrieval funnel,
failure by question phrasing, hallucination taxonomy), and **Methodology** (rubric, probe runs,
run-to-run variance, grader caveats).

The headline it exists to surface is the gap between how good a page *looks* (GEO score) and
how accurately models actually answer from it (fidelity).

```sh
node src/cli.js dashboard                 # -> results/dashboard.html
node src/cli.js dashboard --json          # also write results/dashboard-data.json
node src/cli.js dashboard -o report.html  # custom destination
```

Statistics that cannot be known are rendered as `—`, never as `0`: pages without a probe run
show no fidelity, and probe runs recorded before the search-health counters existed are excluded
from the retrieval funnel rather than counted as zero-search. Superseded `*-old.*` artifacts are
ignored. Where a page was scored more than once, every score appears under Methodology → run-to-run
variance, and the probe-informed re-score is the one used for headline figures.

Each run of `dashboard` also refreshes every page's `probe-matrix.csv` — one row per probe, one
group of columns per model × mode (fidelity, hit, high-severity hallucinations) — so the
probes × models table opens in a spreadsheet without the dashboard.

Run `npm test` to check the parsers, the retrieval rule, and the matrix against every artifact
currently in `results/`. No test touches the network.

Or link it: `npm link` → `geo-audit <command>`.

## Products

Auditing one page at a time misses corpus-wide defects. A `programmingLanguage: "Rust"`
declaration looked like a per-page typo until the checks ran across a product and found it on
every page — a generator default, not an authoring slip.

Discovery needs no crawler. Sites following the `llms.txt` convention publish their own taxonomy:
`docs.chain.link` exposes a curated index at `/{product}/llms.txt`, a full-text bundle at
`/{product}/llms-full.txt`, and a sitemap for complete coverage.

```sh
node src/cli.js product                       # list every product the site advertises
node src/cli.js product vrf --list            # resolve + print the ledger (no fetching, no API)
node src/cli.js product ace --scope full      # 59 pages, ~6s, zero LLM cost
node src/cli.js product vrf --audit           # + one LLM audit over the rollup
node src/cli.js product vrf --probes -n 10    # + product-scoped probes
```

**Three scopes, because "the product" is ambiguous.** `curated` is the page set `llms.txt`
recommends to agents; `full` is every page the sitemap publishes; `bundle` uses the product's
full-text file. The gap between curated and published is reported as a finding in its own right
— VRF's index lists 13 of 36 pages, CCIP's 37 of 725.

**Everything is ledgered.** `pages.json` records every page discovered, whether it was included,
and why not when it wasn't, so a report cannot quietly shrink its own denominator. Two rules the
rollup follows: each check reports `evaluatedPages` and never counts a page it could not assess
as a failure, and scoring is graduated at `(pass + 0.5 × warn) / evaluated`. Fixes rank by
**points recoverable**, so a heavy check failing once outranks a light one warning eight times.

Checks that read the HTML layer — JSON-LD, canonical, dates — skip `.md` endpoints entirely.
Curated indexes link markdown almost exclusively, and markdown has no `<head>`; counting that
absence as a defect penalised pages for being served in the format `llms.txt` asks agents to
prefer.

Product probes are generated from the whole product rather than one page, so they read like
questions asked *before* you know which page holds the answer. The output is a normal
`probes.json`, so `geo-audit probe` runs it unchanged.

## Options

Common: `-o/--output <file>`, `-e/--effort low|medium|high|xhigh|max` (default `high`),
`--no-fallback`, `-h/--help`.

| Command | Extra flags |
|---|---|
| `score` | `-m/--model` auditor (default: by effort) · `-p/--probe-results <file>` probe run JSON for the same URL (adds the probe-informed diagnosis + tiered recommendations) · `--dump-content` |
| `gen-probes` | `-n/--n <count>` (default 10) · `-m/--model` generator (default: by effort) · `-f/--force` regenerate unchanged content · `--allow-thin` generate even from a near-empty extraction |
| `probe` | `-m/--model` model under test (default `claude-opus-4-8`) · `--probe-effort` effort for the model under test (default `medium`) · `--grader-model` (default `claude-sonnet-5`) · `--mode web\|closed` (default `web`) · `--batch` grade via the Batch API at 50% of rates · `-f/--force` re-run every probe instead of resuming |
| `product` | `--scope curated\|full\|bundle` (default `curated`) · `--list` resolve only · `--audit` one LLM audit over the rollup · `--probes` generate product probes · `-n/--n` probe count · `--samples` pages shown in full to the auditor · `--dump-content` · `--origin` |
| `run` | `--stages resolve,audit,probes,test,rollup` (default all) · `--estimate` project cost and exit, no API call · `-y/--yes` proceed above the cost ceiling · `--product-scope` · `-n/--n` probes per page · `--mode web\|closed` · `--batch` · `-f/--force` · `--concurrency` (default 3) |
| `serve` | `--port` (default 4317) · `--host` (loopback only; other interfaces refused) · `--ui <dir>` |
| `dashboard` | `--export <dir>` publish the read-only bundle · `--json` also write `dashboard-data.json` · `--results-dir` |

**Model selection:** the analyst (`score`, `gen-probes`, `product --audit`) defaults to
`claude-opus-4-8`, upgrading to `claude-fable-5` at `--effort max`. The **grader** defaults to
`claude-sonnet-5` (`--grader-model` to override). In `probe`, `-m` is the model being tested,
separate from the grader, and `--probe-effort` controls its effort independently of `-e`.

**`--batch`** submits every grade as one Batch API job at 50% of standard rates. It finishes in
minutes to an hour rather than seconds, and is refused at `--effort max` because the Batch API
rejects the Fable refusal fallback. Measured on a 10-probe run: **$1.07 → $0.54** in grader cost.
Reported costs account for the discount automatically — the API returns `service_tier: "batch"`
in usage, and that field, not a caller-supplied flag, is what halves the price.

## The platform

Two audiences, one tool.

**The docs team** runs routine checks: `geo-audit run watchlist:release-critical` over a curated
set, or a whole product. Runs are resumable and re-running repeats no paid work.

**Leadership** opens a published dashboard on a domain. That artifact is **read-only by
construction** — the export is built with the API client swapped out, so the bundle does not
contain the code that starts runs. It cannot spend money because the code is not in it, not
because it is asked nicely.

### Two measures, never one number

The dashboard leads with **page quality** and **measured answer fidelity** side by side, each with
its own denominator and grader. They are deliberately not combined.

A pre-registered 10-page study
([experiments/correlation/RESULTS.md](experiments/correlation/RESULTS.md)) found structural score
does **not** predict answer fidelity (Spearman r = −0.07, p = .84). A single composite "GEO score"
would assert exactly the link the evidence does not support — and it is the number that ends up in
a deck. `FidelityBadge` throws if rendered without its grader, because Sonnet grades ~12 points
harsher than Opus and a fidelity figure without provenance is not comparable to anything.

### Runs are immutable

Every run writes a snapshot to `results/runs/<runId>/` and is never modified. `results/dashboard/`
is a pure projection, rebuildable from the runs at any time. This replaced overwrite-in-place,
which destroyed the previous audit for any page it touched.

Trends refuse to lie in three specific ways: only a `complete` run posts a point (a partial run's
average is over a self-narrowed denominator); points are joined only within a matching protocol
fingerprint, so a line never crosses a grader change; and score and fidelity are separate series.

### Probes must identify what they are asking about

Every probe declares a `context_mode`:

| mode | the question | what it measures |
|---|---|---|
| `self-contained` | names the product, or uses a term that identifies it alone | whether the docs **answer well** once found |
| `cold` | only what a developer would type knowing nothing | whether the docs are **discoverable** |

Most probes are `self-contained`, because that is what fidelity reports. The rule exists because a
question built from a product-specific term and nothing else is not a test of the documentation —
it is a test of whether a two-word phrase is globally unique, and it usually is not.

> *"How does Confidential HTTP guarantee only one request is sent?"* scored 8. The model searched,
> found no such technology, and answered carefully about TLS and idempotency keys. Rewritten as
> *"In Chainlink CRE, how does the Confidential HTTP capability avoid a duplicate request?"* an
> engine can find the right page, and the score measures the docs rather than the phrasing.

A small number of `cold` probes are kept deliberately — discoverability is a real and separate
measurement, and labelling them stops their low scores reading as poor documentation.

### Cost is gated, not discovered

A full-site sweep of 1,465 pages is ~$250 in audits alone. `--estimate` projects the cost from
measured unit rates and makes no Anthropic call; anything above `GEO_COST_CEILING` (default $10)
needs `--yes`. The server enforces the same ceiling and a client cannot raise it.

### Data does not live in git

`results/runs/` is the source of truth and is **gitignored** — it is generated, changes on every
run, and would conflict on every branch. `results/dashboard/` is a pure projection of it and is
likewise not committed.

So **a fresh clone has no data.** The dashboard will start and show its empty state. Move the
measurements instead of re-buying them — 11MB of runs compresses to about 2.2MB:

```sh
node scripts/data-archive.mjs export geo-data.tgz   # on the machine that has them
node scripts/data-archive.mjs import geo-data.tgz   # on the new one; rebuilds the projection
```

Import never overwrites. Runs are immutable, so a run id that already exists holds identical
content, and keeping it means an import can merge two machines without damaging either.

### Publishing

```sh
node scripts/deploy-vercel.mjs --deploy    # build locally, upload, no data in git
```

The published bundle is read-only **by construction**: `MODE=export` swaps the API client for a
static one at build time, so `/api/runs`, `/api/estimate` and `/api/targets` are not in the
artifact at all. The build refuses to publish if they appear. `noindex` headers ship in
`.vercel/output/config.json` rather than `vercel.json`, because `--prebuilt` skips the remote build
and would never read the latter.

`noindex` is not access control — anyone with the URL can read it, and it carries probe answers and
per-run costs. Use Vercel Deployment Protection if it should be private.

## Scripts

| script | what it does |
|---|---|
| `data-archive.mjs` | move `results/runs/` between machines; rebuilds the projection on import |
| `deploy-vercel.mjs` | assemble and deploy the read-only dashboard without committing data |
| `build-public.mjs` | assemble `public-dist/` only |
| `regrade.mjs` | re-score a run's **stored answers** under the current grader — the answers are the expensive part, grading is ~4% of a run |
| `repair-wrapped-probe-sets.mjs` | one-off recovery for probe sets written by a serialisation bug |
| `import-correlation-study.mjs` | import the pre-registered study as a historical run |

## How it works

- **Extraction** ([src/extract.js](src/extract.js)) — fetches the page, captures raw `<head>`
  metadata and JSON-LD blocks, strips nav/sidebar noise, and converts the main content to GFM
  markdown. `.md` endpoints are passed through as-is.
- **Measured facts** ([src/checks/](src/checks/)) — before the auditor sees a page, the
  mechanically-verifiable parts of the rubric are computed in JavaScript: JSON-LD parsed and
  validated, heading tree and code fences scanned, links and numerals counted. These are injected
  as ground truth so the model stops re-deriving what a parser settles exactly. They are
  **measurements, not scores** — no score, grade or severity field appears in them, enforced by
  test — and the model still assigns every 0–10 itself. `--no-facts` reproduces the old behaviour
  for A/B comparison.
- **Analysis** ([src/claude.js](src/claude.js)) — analyst calls run on **Claude Opus 4.8**
  (**Fable 5** at `--effort max`), the grader on **Sonnet 5**, with system prompts in
  [prompts/](prompts/), streaming, adaptive thinking, `output_config.effort` control, and
  structured outputs (JSON schema) for the JSON-emitting stages so probe/result files are
  always parseable.
- **Ground-truth anchoring** — `gen-probes` snapshots the extracted page content into the
  probes file (`source_content`), and `probe` grades against that exact snapshot. The answer
  key may only contain facts derivable from the page; anything else would poison the grader.
- **Refusal fallback** — when Fable 5 is in use (`--effort max`), its safety classifiers can
  occasionally false-positive on benign technical content. By default a declined request is
  re-served by `claude-opus-4-8` in the same call (noted on stderr). Disable with
  `--no-fallback`. Opus 4.8 runs don't use this path.
- **Prompt caching** — system prompts carry a cache breakpoint, and in `probe` runs the source
  content leads the grader message with its own breakpoint, so all probes in a run share the
  cached prefix. Large prefixes (over ~60k chars, i.e. product contexts) request the **1-hour
  TTL**, because a 5-minute entry cannot outlive a run at ~60–75s per probe. Both breakpoints
  carry the same TTL: blocks render `tools → system → messages`, and a 1h block after a 5m one
  is rejected outright.

## Notes

- At `high`/`xhigh` effort a single `score` audit can take a few minutes; the report streams
  as it's generated.
- `probe --mode web` grants the model-under-test the web search tool (max 5 searches per
  probe) — the realistic retrieval setup. `--mode closed` tests parametric knowledge only;
  retrieval hit rate is `null` by construction, not a miss.
- **Retrieval failure is usually total, not partial.** Across every run so far, answers that miss
  the source cite *nothing at all* rather than citing a sibling page — 14 of 20 on page probes,
  8 of 10 on the first product run. One product run scored 77.2 average fidelity at a 0%
  retrieval rate: the model answered well from memory and never opened the docs. Worth knowing
  before optimising a page for retrieval that may not be happening.
- Plans and their corrections live in [plans/](plans/); [plans/STATUS.md](plans/STATUS.md) is the
  index of what is built and what is left. Several plan hypotheses were **disproven by
  measurement** and are annotated in place — most notably that deterministic pre-checks would
  reduce score variance (they do not; an 18-audit study measured the same 2.5-point spread in
  every condition).
