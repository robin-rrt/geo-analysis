import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractPage } from "./extract.js";
import { runClaude, client, FABLE_MODEL, PROMPTS_DIR } from "./claude.js";
import { buildRequest, runBatch, parseJsonEntry } from "./batch.js";
import { bodyUrls, retrievalHit, retrievalTier } from "./retrieval.js";
import { probeSetId } from "./probe-set.js";

const str = { type: "string" };
const strArr = { type: "array", items: str };
const score = { type: "integer" };

// Structured-output schema for one graded probe. The grader judges content
// only: retrieval, fidelity, and ids are computed or known by the harness, so
// asking the model for them would only buy output tokens and variance.
export const EVAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "scores",
    "hallucinations",
    "missing_must_include",
    "unverifiable_from_source",
    "verdict",
    "retrieval_note",
  ],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["accuracy", "hallucination_free", "relevance", "structure"],
      properties: {
        accuracy: score,
        hallucination_free: score,
        relevance: score,
        structure: score,
      },
    },
    hallucinations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "type", "severity"],
        properties: {
          claim: str,
          type: {
            type: "string",
            enum: [
              "fabricated_function",
              "wrong_import",
              "invented_param",
              "contradiction",
              "other",
            ],
          },
          severity: { type: "string", enum: ["high", "med", "low"] },
        },
      },
    },
    missing_must_include: strArr,
    unverifiable_from_source: strArr,
    verdict: str,
    retrieval_note: str,
  },
};

/** Fidelity, 0–100, from the four 0–10 dimension scores. */
export function fidelityFromScores(s) {
  return Math.round(2.5 * (s.accuracy + s.hallucination_free + s.relevance + s.structure));
}

/** Zeroed token tally; addUsage() folds raw API usage objects into it. */
export function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    web_search_requests: 0,
  };
}

export function addUsage(total, u = {}) {
  total.input_tokens += u.input_tokens ?? 0;
  total.output_tokens += u.output_tokens ?? 0;
  total.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
  total.web_search_requests += u.server_tool_use?.web_search_requests ?? u.web_search_requests ?? 0;
  return total;
}

/** Version of the grading instrument: prompt text + output schema. */
export function graderPromptSha() {
  const prompt = fs.readFileSync(path.join(PROMPTS_DIR, "probe-eval.md"), "utf8");
  return crypto
    .createHash("sha256")
    .update(prompt + JSON.stringify(EVAL_SCHEMA))
    .digest("hex")
    .slice(0, 12);
}

// A previous run is resumable only if its results are comparable with the ones
// this run would produce: same probe set, same model under test and mode, same
// grading instrument. Anything else starts fresh.
const RESUME_KEYS = [
  ["probe_set_id", "the probe set changed"],
  ["model_tested", "a different model under test"],
  ["mode", "a different mode"],
  ["grader_model", "a different grader model"],
  ["grader_effort", "a different grader effort"],
  ["grader_prompt_sha", "the grader prompt or schema changed"],
];

/**
 * Split a probe set into results already finished by a comparable previous run
 * (`done`) and probes still to ask (`todo`). Errored results are retried.
 * `reason` explains why a previous run could not be resumed, when there was one.
 */
export function planResume(previous, identity, probes) {
  const done = new Map();
  let reason = null;
  if (previous) {
    if (!("probe_set_id" in previous)) reason = "it predates resumable runs";
    else reason = RESUME_KEYS.find(([key]) => previous[key] !== identity[key])?.[1] ?? null;
    if (!reason) {
      const ids = new Set(probes.map((p) => p.id));
      for (const r of previous.results ?? []) {
        if (r.stop !== "error" && ids.has(r.probe_id)) done.set(r.probe_id, r);
      }
    }
  }
  return { done, todo: probes.filter((p) => !done.has(p.id)), reason };
}

// Models documented to support the dynamic-filtering web search variant.
const NEW_WEB_SEARCH = /opus-4-[678]|sonnet-5|sonnet-4-6/;
// Models supporting adaptive thinking (Fable 5 omits the param entirely).
const ADAPTIVE_THINKING = /opus-4-[678]|sonnet-5|sonnet-4-6/;

const MAX_CONTINUATIONS = 5;
// Web-search rate limits mid-probe poison the retrieval signal (a miss that
// isn't the page's fault). Retry the whole probe with backoff before giving up.
const SEARCH_RETRY_LIMIT = 3;
const SEARCH_RETRY_BACKOFF_MS = 30_000;
// Pause between batches in web mode so back-to-back search bursts don't trip
// rate limits.
const PROBE_PACING_MS = 8_000;
// How many probes run concurrently. Each probe can fire up to 5 searches, so
// keep this low — 3 concurrent probes is already a burst of up to 15 searches.
const PROBE_CONCURRENCY = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Above this, the shared grading prefix is worth a 1-hour cache entry (2x write,
// 0.1x read) rather than the 5-minute default that a long run outlives.
const LARGE_PREFIX_CHARS = 60_000;

// Placeholder written while a probe waits for its batched grade. Any result
// still carrying it after the batch is merged means the grade never arrived.
const PENDING_GRADE = {
  scores: null,
  fidelity: null,
  hallucinations: [],
  missing_must_include: [],
  unverifiable_from_source: [],
  verdict: "Queued for batch grading.",
  retrieval_note: "",
};

// Web-search tool errors surface as web_search_tool_result blocks whose
// content is an error object rather than a results array.
export function searchErrorCodes(blocks) {
  const codes = [];
  for (const b of blocks) {
    if (b.type !== "web_search_tool_result" || Array.isArray(b.content)) continue;
    const code = b.content?.error_code;
    if (code) codes.push(code);
  }
  return codes;
}

const RETRYABLE_SEARCH_ERRORS = new Set(["too_many_requests", "unavailable"]);

async function executeProbeOnce({ prompt, model, mode, probeEffort }) {
  const isFable = model === FABLE_MODEL;
  const base = {
    model,
    max_tokens: 16000,
    ...(!isFable && ADAPTIVE_THINKING.test(model) && { thinking: { type: "adaptive" } }),
    ...(probeEffort && { output_config: { effort: probeEffort } }),
    ...(mode === "web" && {
      tools: [
        {
          type: NEW_WEB_SEARCH.test(model) ? "web_search_20260209" : "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        },
      ],
    }),
  };

  // Accumulate content across pause_turn continuations — each resumed turn
  // returns only its new blocks, so reading just the last final.content would
  // drop earlier text, citations, and tool results.
  let messages = [{ role: "user", content: prompt }];
  const blocks = [];
  const usage = emptyUsage();
  let final;
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = client().messages.stream({ ...base, messages });
    final = await stream.finalMessage();
    blocks.push(...final.content);
    addUsage(usage, final.usage);
    if (final.stop_reason !== "pause_turn") break;
    // Server-side tool loop paused — append the assistant turn and resume.
    messages = [...messages, { role: "assistant", content: final.content }];
  }

  const searchErrors = searchErrorCodes(blocks);
  const searchDegraded = searchErrors.some((c) => RETRYABLE_SEARCH_ERRORS.has(c));
  // Live-search health: how many searches the model attempted vs how many
  // actually returned results. web mode with attempts but zero successes means
  // retrieval never had a chance — the probe's miss is not the page's fault.
  const searchesAttempted = blocks.filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search",
  ).length;
  const searchesSucceeded = blocks.filter(
    (b) => b.type === "web_search_tool_result" && Array.isArray(b.content),
  ).length;

  if (final.stop_reason === "refusal") {
    return {
      answer: "(model refused to answer)",
      citedUrls: [],
      stopReason: "refusal",
      searchErrors,
      searchDegraded,
      searchesAttempted,
      searchesSucceeded,
      usage,
    };
  }

  const answer = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Cited URLs = citations attached to text blocks plus links embedded in the
  // answer body (both are attribution), not every search result the model saw.
  const cited = new Set();
  for (const block of blocks) {
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) if (c.url) cited.add(c.url);
    }
  }
  for (const url of bodyUrls(answer)) cited.add(url);

  return {
    answer,
    citedUrls: [...cited],
    stopReason: final.stop_reason,
    searchErrors,
    searchDegraded,
    searchesAttempted,
    searchesSucceeded,
    usage,
  };
}

/**
 * Executor: send one probe prompt to the model-under-test, as a plain user
 * would. mode "web" grants web search (the realistic retrieval setup);
 * "closed" tests parametric knowledge only. Probes whose web search was
 * rate-limited are retried with backoff; if degradation persists, the result
 * is flagged so the retrieval metrics can treat it as inconclusive. Usage is
 * summed across retries — a retried attempt is still paid for.
 */
export async function executeProbe({ prompt, model, mode, probeEffort, log = () => {} }) {
  const usage = emptyUsage();
  let result;
  for (let attempt = 0; ; attempt++) {
    result = await executeProbeOnce({ prompt, model, mode, probeEffort });
    addUsage(usage, result.usage);
    if (!result.searchDegraded || attempt >= SEARCH_RETRY_LIMIT) {
      return { ...result, usage, retries: attempt };
    }
    const delay = SEARCH_RETRY_BACKOFF_MS * (attempt + 1);
    log(`search rate-limited (${result.searchErrors.join(",")}), retrying in ${delay / 1000}s ... `);
    await sleep(delay);
  }
}

const RETRIEVAL_LINE = {
  citation: "the expected source was cited",
  mention: "the expected source was named in the answer text (no citation block)",
  miss: "the expected source was NOT cited",
  closed: "not applicable (closed mode: no retrieval)",
};

/**
 * Grader: scores one answer against the source page as sole ground truth.
 * The grader is blind to which model wrote the answer. The source content
 * leads the user message with its own cache breakpoint so all probes in a run
 * share the cached prefix.
 */
export async function gradeProbe({
  probe,
  graderModel,
  answer,
  citedUrls,
  retrieval,
  sourceContent,
  effort,
  cacheTtl,
}) {
  const userContent = buildGradeContent({
    probe,
    answer,
    citedUrls,
    retrieval,
    sourceContent,
    cacheTtl,
  });

  const usage = emptyUsage();
  const grade = await runClaude({
    promptFile: "probe-eval.md",
    userContent,
    model: graderModel,
    effort,
    jsonSchema: EVAL_SCHEMA,
    cacheTtl,
    onUsage: (u) => addUsage(usage, u),
  });
  return { grade: { ...grade, fidelity: fidelityFromScores(grade.scores) }, usage };
}

/**
 * The grader's user message. Shared by the synchronous and batched paths — if
 * these diverge, a batched grade stops being comparable with a synchronous one.
 */
export function buildGradeContent({ probe, answer, citedUrls, retrieval, sourceContent, cacheTtl }) {
  const retrievalKey =
    retrieval.hit_expected_source === null ? "closed" : (retrieval.via ?? "miss");
  return [
    {
      type: "text",
      text: `Source content (ground truth):\n\n${sourceContent}`,
      cache_control: cacheTtl ? { type: "ephemeral", ttl: cacheTtl } : { type: "ephemeral" },
    },
    {
      type: "text",
      text: [
        `Probe: ${JSON.stringify({
          id: probe.id,
          archetype: probe.archetype,
          expected_source_urls: probe.expected_source_urls,
        })}`,
        ``,
        `Prompt: ${probe.prompt}`,
        ``,
        `Answer key: ${JSON.stringify(probe.answer_key)}`,
        ``,
        `Answer under test:\n${answer}`,
        ``,
        `Cited URLs: ${JSON.stringify(citedUrls)}`,
        ``,
        `Retrieval: ${RETRIEVAL_LINE[retrievalKey]}`,
      ].join("\n"),
    },
  ];
}

/**
 * Execute + grade one probe. Log messages are buffered and returned as a
 * single block rather than written directly, so concurrent probes in the
 * same batch don't interleave partial lines on stderr.
 */

/**
 * Retrieval verdict for one answer. With `scopeUrls` (a product's page set) the
 * outcome is tiered; without it, the page-scoped exact-match rule applies and
 * `tier` is null. Exported so the decision is testable on its own.
 */
export function decideRetrieval({ citedUrls = [], answer = "", expectedUrls = [], scopeUrls = [] }) {
  if (scopeUrls?.length) {
    return retrievalTier({ citedUrls, answer, expectedUrls, scopeUrls });
  }
  return { ...retrievalHit({ citedUrls, answer, expectedUrls }), tier: null };
}

async function runOneProbe({
  probe,
  model,
  graderModel,
  mode,
  effort,
  sourceContent,
  scopeUrls,
  cacheTtl,
  deferGrade,
  probeEffort,
}) {
  const lines = [];
  const bufLog = (msg) => lines.push(msg);

  bufLog(`${probe.id} [${probe.archetype}] asking ${model} (${mode}) ... `);
  const asked = await executeProbe({ prompt: probe.prompt, model, mode, probeEffort, log: bufLog });
  const { answer, citedUrls, stopReason, searchDegraded, searchesAttempted, searchesSucceeded } =
    asked;
  // Live search "didn't work" = the model tried to search but nothing came
  // back. (Attempting zero searches is the model's own choice — a real miss.)
  const liveSearchFailed = mode === "web" && searchesAttempted > 0 && searchesSucceeded === 0;

  // Retrieval is a string match, decided here rather than by the grader.
  // Closed mode has no retrieval to hit or miss, so the hit is null, not false.
  // With a product scope, grade retrieval as a tier: citing a sibling page of
  // the same product is materially different from citing nothing. `hit` stays
  // true only for an exact match, so hit rates remain comparable with page runs.
  const verdict = decideRetrieval({
    citedUrls,
    answer,
    expectedUrls: probe.expected_source_urls,
    scopeUrls,
  });
  const { hit, via } = verdict;
  const retrieval = {
    cited_urls: citedUrls,
    hit_expected_source: mode === "web" ? hit : null,
    via: mode === "web" ? via : null,
    tier: mode === "web" ? (verdict.tier ?? null) : null,
    notes: "",
  };

  // A refusal has nothing to grade — paying the grader to score the
  // placeholder text would only record a misleading low fidelity.
  let graded;
  if (stopReason === "refusal") {
    graded = {
      grade: {
        scores: null,
        fidelity: null,
        hallucinations: [],
        missing_must_include: [],
        unverifiable_from_source: [],
        verdict: "Model refused to answer — not graded.",
        retrieval_note: "",
      },
      usage: emptyUsage(),
    };
  } else if (deferGrade) {
    // Batched: record what this probe needs graded and fill the result in later.
    deferGrade({
      probeId: probe.id,
      userContent: buildGradeContent({ probe, answer, citedUrls, retrieval, sourceContent, cacheTtl }),
    });
    graded = { grade: PENDING_GRADE, usage: emptyUsage(), pending: true };
    bufLog(`queued for batch grading ... `);
  } else {
    bufLog(`grading (${graderModel}) ... `);
    graded = await gradeProbe({
      probe,
      graderModel,
      answer,
      citedUrls,
      retrieval,
      sourceContent,
      effort,
      cacheTtl,
    });
  }
  const { retrieval_note: retrievalNote, ...grade } = graded.grade;
  retrieval.notes = retrievalNote;

  const result = {
    probe_id: probe.id,
    model_tested: model,
    retrieval,
    ...grade,
    prompt: probe.prompt,
    archetype: probe.archetype,
    answer,
    stop: stopReason,
    harness: {
      retries: asked.retries,
      searches_attempted: searchesAttempted,
      searches_succeeded: searchesSucceeded,
      search_errors: asked.searchErrors,
      search_degraded: searchDegraded,
      live_search_failed: liveSearchFailed,
    },
    usage: { model_under_test: asked.usage, grader: graded.usage },
  };

  const outcome =
    retrieval.hit_expected_source === null
      ? "closed mode"
      : via === "mention"
        ? "source named in text"
        : hit
          ? "source cited"
          : "source NOT cited";
  const flags = [
    searchDegraded && "search degraded — inconclusive",
    liveSearchFailed && !searchDegraded && "LIVE SEARCH FAILED — inconclusive",
    mode === "web" && searchesAttempted === 0 && "model did not search",
  ].filter(Boolean);
  const score = grade.fidelity === null ? "refused — not graded" : `fidelity ${grade.fidelity}/100`;
  bufLog(`${score} (${[outcome, ...flags].join(", ")})\n`);

  return { result, logText: lines.join("") };
}

/**
 * Summary figures for a set of probe results. Refused probes carry no grade
 * and are left out of score averages; closed-mode probes carry no retrieval
 * verdict (null) and are left out of hit rates, which are then null.
 */
export function summarizeResults(results) {
  const graded = results.filter((r) => Number.isFinite(r.fidelity));
  const avg = (rows, fn) =>
    rows.length
      ? Math.round((rows.reduce((sum, r) => sum + fn(r), 0) / rows.length) * 10) / 10
      : null;
  const rate = (n, d) => (d > 0 ? Math.round((n / d) * 100) / 100 : null);

  // A miss whose web search was rate-limited or returned nothing is
  // inconclusive, not a GEO miss: the effective hit rate excludes those
  // probes from the denominator.
  const judged = results.filter((r) => r.retrieval.hit_expected_source !== null);
  const hits = judged.filter((r) => r.retrieval.hit_expected_source);
  const inconclusiveMisses = judged.filter(
    (r) =>
      (r.harness.search_degraded || r.harness.live_search_failed) &&
      !r.retrieval.hit_expected_source,
  ).length;

  const usage = { model_under_test: emptyUsage(), grader: emptyUsage() };
  for (const r of results) {
    addUsage(usage.model_under_test, r.usage?.model_under_test);
    addUsage(usage.grader, r.usage?.grader);
  }

  return {
    probe_count: results.length,
    graded_count: graded.length,
    refusal_count: results.filter((r) => r.stop === "refusal").length,
    error_count: results.filter((r) => r.stop === "error").length,
    avg_fidelity: avg(graded, (r) => r.fidelity),
    retrieval_hit_rate: rate(hits.length, judged.length),
    retrieval_hit_rate_effective: rate(hits.length, judged.length - inconclusiveMisses),
    retrieval_mention_hit_count: hits.filter((r) => r.retrieval.via === "mention").length,
    search_degraded_count: results.filter((r) => r.harness.search_degraded).length,
    live_search_failed_count: results.filter((r) => r.harness.live_search_failed).length,
    inconclusive_miss_count: inconclusiveMisses,
    avg_scores: graded.length
      ? {
          accuracy: avg(graded, (r) => r.scores.accuracy),
          hallucination_free: avg(graded, (r) => r.scores.hallucination_free),
          relevance: avg(graded, (r) => r.scores.relevance),
          structure: avg(graded, (r) => r.scores.structure),
        }
      : null,
    usage,
  };
}

/**
 * A probe whose ask or grade threw. It is recorded rather than failing the
 * whole run, and a re-run retries it (errored results are never resumed).
 */
function errorOutcome(probe, model, err) {
  const message = String(err?.message ?? err);
  return {
    result: {
      probe_id: probe.id,
      model_tested: model,
      retrieval: { cited_urls: [], hit_expected_source: null, via: null, notes: "" },
      scores: null,
      fidelity: null,
      hallucinations: [],
      missing_must_include: [],
      unverifiable_from_source: [],
      verdict: "Probe failed — not graded.",
      prompt: probe.prompt,
      archetype: probe.archetype,
      answer: "",
      stop: "error",
      error: message,
      harness: {
        retries: 0,
        searches_attempted: null,
        searches_succeeded: null,
        search_errors: [],
        search_degraded: false,
        live_search_failed: null,
      },
      usage: { model_under_test: emptyUsage(), grader: emptyUsage() },
    },
    logText: `${probe.id} [${probe.archetype}] ERROR: ${message}\n`,
  };
}

/**
 * Run every probe in a probes.json file: execute against the model-under-test,
 * grade with the grader model, and return a summary with per-probe results.
 * Probes run in capped-concurrency batches (PROBE_CONCURRENCY at a time) —
 * fully sequential is safe but slow, fully parallel bursts too many searches
 * at once and trips the web_search tool's rate limit.
 *
 * With `previous` (the existing run file for this model and mode), finished
 * results from a comparable run are kept and only the remaining probes are
 * asked. `onProgress` receives the full summary after every batch so the
 * caller can persist it — an interrupted run then resumes where it stopped.
 */
export async function runProbes({
  probesFile,
  model,
  graderModel,
  mode,
  effort,
  previous = null,
  onProgress = () => {},
  log = () => {},
  batch = false,
  probeEffort,
}) {
  const probeSet = JSON.parse(fs.readFileSync(probesFile, "utf8"));
  if (!Array.isArray(probeSet.probes) || probeSet.probes.length === 0) {
    throw new Error(`no probes found in ${probesFile}`);
  }

  // Product probe sets carry the product's page list; page sets do not. Its
  // presence is what switches retrieval from exact-match to tiered.
  const scopeUrls = probeSet.scope_urls ?? [];

  // A 5-minute cache entry cannot outlive a real run — probes take ~60-75s
  // each. A large shared prefix must use the 1-hour TTL or every probe silently
  // re-writes it at full price instead of reading it.
  const cacheTtl = (probeSet.source_content?.length ?? 0) > LARGE_PREFIX_CHARS ? "1h" : null;

  // Grades collected while asking, then submitted as one batch at 50% of rates.
  const pendingGrades = [];

  let sourceContent = probeSet.source_content;
  if (!sourceContent) {
    log(`no source_content in probes file — refetching ${probeSet.source_url} ...\n`);
    sourceContent = (await extractPage(probeSet.source_url)).markdown;
  }

  const identity = {
    source_url: probeSet.source_url,
    source_title: probeSet.source_title,
    probe_set_id: probeSetId(probeSet.probes),
    model_tested: model,
    mode,
    grader_model: graderModel,
    grader_effort: effort,
    probe_effort: probeEffort ?? null,
    grader_prompt_sha: graderPromptSha(),
  };

  const { done, todo, reason } = planResume(previous, identity, probeSet.probes);
  if (reason) log(`existing run file not resumed (${reason}) — starting fresh\n`);
  if (done.size) {
    log(`resuming: ${done.size} of ${probeSet.probes.length} probes already answered, ${todo.length} to run\n`);
  }

  // Results always follow probes.json order, however they were produced.
  const summary = () => {
    const results = probeSet.probes.map((p) => done.get(p.id)).filter(Boolean);
    return { ...identity, run_at: new Date().toISOString(), ...summarizeResults(results), results };
  };

  for (let i = 0; i < todo.length; i += PROBE_CONCURRENCY) {
    // Pace batches in web mode so back-to-back search bursts don't trip rate limits.
    if (i > 0 && mode === "web") await sleep(PROBE_PACING_MS);

    const chunk = todo.slice(i, i + PROBE_CONCURRENCY);
    const outcomes = await Promise.all(
      chunk.map((probe) =>
        runOneProbe({
          probe,
          model,
          graderModel,
          mode,
          effort,
          sourceContent,
          scopeUrls,
          cacheTtl,
          probeEffort,
          deferGrade: batch ? (req) => pendingGrades.push(req) : undefined,
        }).catch((err) =>
          errorOutcome(probe, model, err),
        ),
      ),
    );
    // Flush in submission order (not completion order) so output stays
    // deterministic and matches the probes.json order run-to-run.
    for (const { result, logText } of outcomes) {
      log(logText);
      done.set(result.probe_id, result);
    }
    onProgress(summary());
  }

  if (batch && pendingGrades.length) {
    log(`\nsubmitting ${pendingGrades.length} grade(s) as one batch (50% of standard rates)\n`);
    const entries = await runBatch({
      requests: pendingGrades.map((g) =>
        buildRequest({
          customId: g.probeId,
          promptFile: "probe-eval.md",
          userContent: g.userContent,
          model: graderModel,
          effort,
          jsonSchema: EVAL_SCHEMA,
          cacheTtl,
        }),
      ),
      log,
    });

    for (const { probeId } of pendingGrades) {
      const result = done.get(probeId);
      if (!result) continue;
      const parsed = parseJsonEntry(entries.get(probeId), probeId);

      if (!parsed.ok) {
        // A failed grade leaves the probe ungraded and says why, rather than
        // silently keeping the "queued" placeholder as if it were a verdict.
        result.verdict = `Batch grading failed — ${parsed.error}`;
        result.stop = "error";
        result.error = parsed.error;
        log(`  ${probeId}: grade failed — ${parsed.error}\n`);
        continue;
      }

      const { retrieval_note: note, ...grade } = parsed.value;
      Object.assign(result, grade, { fidelity: fidelityFromScores(grade.scores) });
      result.retrieval.notes = note ?? "";
      addUsage(result.usage.grader, parsed.usage);
      log(`  ${probeId}: fidelity ${result.fidelity}/100\n`);
    }
    onProgress(summary());
  }

  return summary();
}
