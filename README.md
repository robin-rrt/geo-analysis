# geo-analysis

`geo-audit` — a CLI that measures **Generative Engine Optimization (GEO)** for documentation
pages: how likely a page is to be retrieved, cited, and accurately synthesized by generative
engines (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews) and by coding agents that
read docs to complete tasks.

Three subcommands form a pipeline:

| Command | What it does | Output |
|---|---|---|
| `score <url>` | Audits a page against a weighted GEO rubric | Scored Markdown report (0–100, 9 dimensions, prioritized fixes) |
| `gen-probes <url>` | Generates realistic developer prompts the page should be the canonical answer to, with a source-grounded answer key. Skips pages whose content is unchanged | `probes.json` |
| `probe <probes.json>` | Asks a model-under-test each probe (web retrieval on by default), then grades every answer against the source page as sole ground truth. Resumes where an interrupted run stopped | `probe-results-<model>-<mode>.json` + `probe-matrix.csv` |
| `dashboard` | Rolls every artifact in `results/` into one shareable HTML report | `dashboard.html` |

All analyst/grader work runs on **Claude Opus 4.8** by default. **Claude Fable 5** is
selected automatically at `--effort max` (its extra capability is worth the cost only for the
hardest jobs); override the model with `-m` on `score` / `gen-probes`.

The `probe` grader catches the hallucinations that matter most for developer docs: fabricated
function names, wrong import/package paths, invented params, deprecated APIs, out-of-order
steps. It judges content only, and is blind to which model wrote the answer, so answers from
different models are graded on the same footing.

**Retrieval is decided in code, not by the grader** ([src/retrieval.js](src/retrieval.js)): a hit
is a cited URL that matches the expected source once normalised (scheme, `www.`, trailing slash,
`.md` twin, query and fragment ignored), or the source named in the answer text without a scheme
— `via` records which. Fidelity is likewise arithmetic, `round(2.5 × Σ scores)`. A refusal is
recorded and not graded; in `closed` mode there is no retrieval to hit, so the verdict is `null`,
never a miss. Each result carries the tokens it cost, split between model-under-test and grader.

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

# 5. Roll everything in results/ into one shareable HTML report (no API calls)
node src/cli.js dashboard

# Inspect what gets sent to the auditor (no API call)
node src/cli.js score https://docs.chain.link/data-feeds --dump-content
```

## Dashboard

`dashboard` reads `results/` and writes a single self-contained `results/dashboard.html` —
no server, no external requests, no dependencies. Open it with `file://` or send the file to
someone who never ran the tool.

Four views: **Overview** (corpus KPIs, the score-vs-fidelity gap chart, all pages, weakest
dimensions), **Pages** (per-page scorecard / recommendations / probes / anti-patterns),
**Answer quality** (what retrieval is worth, retrieval funnel, failure by question phrasing,
hallucination taxonomy), and **Methodology** (rubric, probe runs, run-to-run variance, caveats).

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

## Options

Common: `-o/--output <file>`, `-e/--effort low|medium|high|xhigh|max` (default `high`),
`--no-fallback`, `-h/--help`.

| Command | Extra flags |
|---|---|
| `score` | `-m/--model` auditor (default: by effort) · `-p/--probe-results <file>` probe run JSON for the same URL (adds the probe-informed diagnosis + tiered recommendations) · `--dump-content` |
| `gen-probes` | `-n/--n <count>` (default 10) · `-m/--model` generator (default: by effort) · `-f/--force` regenerate unchanged content · `--allow-thin` generate even from a near-empty extraction |
| `probe` | `-m/--model` model under test (default `claude-opus-4-8`) · `--mode web\|closed` (default `web`) · `-f/--force` re-run every probe instead of resuming — the grader model is selected by effort |

**Model selection:** analyst/grader defaults to `claude-opus-4-8`; `--effort max` upgrades it
to `claude-fable-5`. `-m` overrides on `score`/`gen-probes`. In `probe`, `-m` is the model
being tested (separate from the grader).

## How it works

- **Extraction** ([src/extract.js](src/extract.js)) — fetches the page, captures raw `<head>`
  metadata and JSON-LD blocks, strips nav/sidebar noise, and converts the main content to GFM
  markdown. `.md` endpoints are passed through as-is.
- **Analysis** ([src/claude.js](src/claude.js)) — analyst/grader calls run on
  **Claude Opus 4.8** by default (**Fable 5** at `--effort max`), with system prompts in
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
  cached prefix.

## Notes

- At `high`/`xhigh` effort a single `score` audit can take a few minutes; the report streams
  as it's generated.
- `probe --mode web` grants the model-under-test the web search tool (max 5 searches per
  probe) — the realistic retrieval setup. `--mode closed` tests parametric knowledge only;
  retrieval hit rate will be 0 by construction.
