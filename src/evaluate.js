import fs from "node:fs";
import { extractPage } from "./extract.js";
import { runClaude, client, FABLE_MODEL } from "./claude.js";

const str = { type: "string" };
const strArr = { type: "array", items: str };
const score = { type: "integer" };

// Structured-output schema for one graded probe.
export const EVAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "probe_id",
    "model_tested",
    "retrieval",
    "scores",
    "fidelity",
    "hallucinations",
    "missing_must_include",
    "unverifiable_from_source",
    "verdict",
  ],
  properties: {
    probe_id: str,
    model_tested: str,
    retrieval: {
      type: "object",
      additionalProperties: false,
      required: ["cited_urls", "hit_expected_source", "notes"],
      properties: {
        cited_urls: strArr,
        hit_expected_source: { type: "boolean" },
        notes: str,
      },
    },
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
    fidelity: score,
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
  },
};

// Models documented to support the dynamic-filtering web search variant.
const NEW_WEB_SEARCH = /opus-4-[678]|sonnet-5|sonnet-4-6/;
// Models supporting adaptive thinking (Fable 5 omits the param entirely).
const ADAPTIVE_THINKING = /opus-4-[678]|sonnet-5|sonnet-4-6/;

const MAX_CONTINUATIONS = 5;
// Web-search rate limits mid-probe poison the retrieval signal (a miss that
// isn't the page's fault). Retry the whole probe with backoff before giving up.
const SEARCH_RETRY_LIMIT = 2;
const SEARCH_RETRY_BACKOFF_MS = 20_000;
// Pause between probes in web mode so a run doesn't trip search rate limits.
const PROBE_PACING_MS = 2_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Inline links in the answer body count as attribution: models often link the
// source in prose/markdown without emitting an API citation block, and
// counting only block citations under-reports retrieval hits.
export function bodyUrls(text) {
  const urls = new Set();
  for (const raw of text.match(/https?:\/\/[^\s)\]}"'`<>]+/g) ?? []) {
    urls.add(raw.replace(/[.,;:!?]+$/, ""));
  }
  return urls;
}

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

async function executeProbeOnce({ prompt, model, mode }) {
  const isFable = model === FABLE_MODEL;
  const base = {
    model,
    max_tokens: 16000,
    ...(!isFable && ADAPTIVE_THINKING.test(model) && { thinking: { type: "adaptive" } }),
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
  let final;
  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = client().messages.stream({ ...base, messages });
    final = await stream.finalMessage();
    blocks.push(...final.content);
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
  };
}

/**
 * Executor: send one probe prompt to the model-under-test, as a plain user
 * would. mode "web" grants web search (the realistic retrieval setup);
 * "closed" tests parametric knowledge only. Probes whose web search was
 * rate-limited are retried with backoff; if degradation persists, the result
 * is flagged so the retrieval metrics can treat it as inconclusive.
 */
export async function executeProbe({ prompt, model, mode, log = () => {} }) {
  let result;
  for (let attempt = 0; ; attempt++) {
    result = await executeProbeOnce({ prompt, model, mode });
    if (!result.searchDegraded || attempt >= SEARCH_RETRY_LIMIT) {
      return { ...result, retries: attempt };
    }
    const delay = SEARCH_RETRY_BACKOFF_MS * (attempt + 1);
    log(`search rate-limited (${result.searchErrors.join(",")}), retrying in ${delay / 1000}s ... `);
    await sleep(delay);
  }
}

/**
 * Grader: scores one answer against the source page as sole ground truth.
 * `model` is the model-under-test (recorded in the output); `graderModel` is
 * the Claude model doing the grading. The source content leads the user
 * message with its own cache breakpoint so all probes in a run share the
 * cached prefix.
 */
export async function gradeProbe({
  probe,
  model,
  graderModel,
  answer,
  citedUrls,
  sourceContent,
  effort,
}) {
  const userContent = [
    {
      type: "text",
      text: `Source content (ground truth):\n\n${sourceContent}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: [
        `MODEL: ${model}`,
        ``,
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
        `Model answer:\n${answer}`,
        ``,
        `Cited URLs: ${JSON.stringify(citedUrls)}`,
      ].join("\n"),
    },
  ];

  const grade = await runClaude({
    promptFile: "probe-eval.md",
    userContent,
    model: graderModel,
    effort,
    jsonSchema: EVAL_SCHEMA,
  });
  grade.probe_id = probe.id; // authoritative, not model-echoed
  grade.model_tested = model;
  return grade;
}

/**
 * Run every probe in a probes.json file: execute against the model-under-test,
 * grade with the grader model, and return a summary with per-probe results.
 */
export async function runProbes({ probesFile, model, graderModel, mode, effort, log = () => {} }) {
  const probeSet = JSON.parse(fs.readFileSync(probesFile, "utf8"));
  if (!Array.isArray(probeSet.probes) || probeSet.probes.length === 0) {
    throw new Error(`no probes found in ${probesFile}`);
  }

  let sourceContent = probeSet.source_content;
  if (!sourceContent) {
    log(`no source_content in probes file — refetching ${probeSet.source_url} ...\n`);
    sourceContent = (await extractPage(probeSet.source_url)).markdown;
  }

  const results = [];
  let first = true;
  for (const probe of probeSet.probes) {
    // Pace web-mode probes so back-to-back searches don't trip rate limits.
    if (!first && mode === "web") await sleep(PROBE_PACING_MS);
    first = false;

    log(`${probe.id} [${probe.archetype}] asking ${model} (${mode}) ... `);
    const {
      answer,
      citedUrls,
      searchErrors,
      searchDegraded,
      searchesAttempted,
      searchesSucceeded,
      retries,
    } = await executeProbe({ prompt: probe.prompt, model, mode, log });
    // Live search "didn't work" = the model tried to search but nothing came
    // back. (Attempting zero searches is the model's own choice — a real miss.)
    const liveSearchFailed = mode === "web" && searchesAttempted > 0 && searchesSucceeded === 0;
    log(`grading (${graderModel}) ... `);
    const grade = await gradeProbe({
      probe,
      model,
      graderModel,
      answer,
      citedUrls,
      sourceContent,
      effort,
    });
    results.push({
      ...grade,
      prompt: probe.prompt,
      archetype: probe.archetype,
      answer,
      harness: {
        retries,
        searches_attempted: searchesAttempted,
        searches_succeeded: searchesSucceeded,
        search_errors: searchErrors,
        search_degraded: searchDegraded,
        live_search_failed: liveSearchFailed,
      },
    });
    const hit = grade.retrieval.hit_expected_source ? "source cited" : "source NOT cited";
    const flags = [
      searchDegraded && "search degraded — inconclusive",
      liveSearchFailed && !searchDegraded && "LIVE SEARCH FAILED — inconclusive",
      mode === "web" && searchesAttempted === 0 && "model did not search",
    ].filter(Boolean);
    log(`fidelity ${grade.fidelity}/100 (${[hit, ...flags].join(", ")})\n`);
  }

  const avg = (fn) =>
    Math.round((results.reduce((sum, r) => sum + fn(r), 0) / results.length) * 10) / 10;

  // A miss whose web search was rate-limited or returned nothing is
  // inconclusive, not a GEO miss: the effective hit rate excludes those
  // probes from the denominator.
  const hits = results.filter((r) => r.retrieval.hit_expected_source).length;
  const inconclusiveMisses = results.filter(
    (r) =>
      (r.harness.search_degraded || r.harness.live_search_failed) &&
      !r.retrieval.hit_expected_source,
  ).length;
  const conclusive = results.length - inconclusiveMisses;
  const rate = (n, d) => (d > 0 ? Math.round((n / d) * 100) / 100 : null);

  return {
    source_url: probeSet.source_url,
    source_title: probeSet.source_title,
    model_tested: model,
    grader_model: graderModel,
    mode,
    run_at: new Date().toISOString(),
    probe_count: results.length,
    avg_fidelity: avg((r) => r.fidelity),
    retrieval_hit_rate: rate(hits, results.length),
    retrieval_hit_rate_effective: rate(hits, conclusive),
    search_degraded_count: results.filter((r) => r.harness.search_degraded).length,
    live_search_failed_count: results.filter((r) => r.harness.live_search_failed).length,
    inconclusive_miss_count: inconclusiveMisses,
    avg_scores: {
      accuracy: avg((r) => r.scores.accuracy),
      hallucination_free: avg((r) => r.scores.hallucination_free),
      relevance: avg((r) => r.scores.relevance),
      structure: avg((r) => r.scores.structure),
    },
    results,
  };
}
