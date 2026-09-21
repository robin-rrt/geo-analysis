import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROMPTS_DIR = path.join(here, "..", "prompts");

export const OPUS_MODEL = "claude-opus-4-8";
export const SONNET_MODEL = "claude-sonnet-5";
export const FABLE_MODEL = "claude-fable-5";
const FALLBACK_MODEL = OPUS_MODEL;

// Analyst/grader work defaults to Opus 4.8; Fable 5 is reserved for the highest
// effort tier ("super high effort"), where the extra capability is worth its
// cost. An explicit model override always wins.
export const DEFAULT_MODEL = OPUS_MODEL;
export function analystModel(effort, override) {
  if (override) return override;
  return effort === "max" ? FABLE_MODEL : OPUS_MODEL;
}

// Grading is a constrained task: a fixed source, an answer key, four scores and
// a hallucination list. It does not need the analyst tier, and it runs once per
// probe, so it dominates grading spend. Sonnet 5 is $3/$15 against Opus 4.8's
// $5/$25. `--effort max` still escalates, for the rare run where the grader
// itself is the thing being stress-tested.
export const DEFAULT_GRADER_MODEL = SONNET_MODEL;

/** Default model under test for probes. Shared so the CLI and the server agree. */
export const DEFAULT_PROBE_TARGET = OPUS_MODEL;
export function graderModelFor(effort, override) {
  if (override) return override;
  return effort === "max" ? FABLE_MODEL : SONNET_MODEL;
}

let _client;
export function client() {
  // SDK default is 2 retries; probe runs make many back-to-back calls, so give
  // API-level 429/5xx a longer runway before a run fails.
  return (_client ??= new Anthropic({ maxRetries: 4 }));
}

/**
 * Run one Claude turn with a system prompt file from prompts/.
 *
 * - `userContent` is a string or an array of content blocks (blocks let callers
 *   put a large stable prefix first with its own cache_control).
 * - With `jsonSchema` set, uses structured outputs and returns parsed JSON;
 *   otherwise returns the response text.
 * - `onUsage`, if given, receives the response's raw `usage` object.
 */
export async function runClaude({
  promptFile,
  userContent,
  effort = "high",
  model = DEFAULT_MODEL,
  fallback = true,
  onText,
  onUsage,
  jsonSchema,
  tally,
  tallyLabel = "call",
  cacheTtl,
}) {
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, promptFile), "utf8");
  // The server-side refusal fallback (beta) applies only to Fable 5, whose
  // safety classifiers can false-positive on benign technical content.
  const useFallback = fallback && model === FABLE_MODEL;

  // Adaptive thinking is valid on both Opus 4.8 and Fable 5. Opus 4.8 runs
  // WITHOUT thinking if the param is omitted, so set it explicitly.
  // Stream so long turns (minutes at high effort) don't hit HTTP timeouts.
  const stream = client().beta.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: {
      effort,
      ...(jsonSchema && { format: { type: "json_schema", schema: jsonSchema } }),
    },
    system: [
      // Stable prefix — cache it so repeated calls reuse the prompt.
      // Rendered before `messages`, so this TTL must be at least as long as any
      // cache_control later in the request — a 1h block after a 5m one is a 400.
      {
        type: "text",
        text: systemPrompt,
        cache_control: cacheTtl ? { type: "ephemeral", ttl: cacheTtl } : { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userContent }],
    ...(useFallback && {
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: FALLBACK_MODEL }],
    }),
  });

  if (onText) stream.on("text", onText);

  const final = await stream.finalMessage();
  onUsage?.(final.usage);

  // Record before any early return, so a refusal or truncation still shows what
  // it cost. `final.model` rather than the requested one — a fallback may have
  // served this turn at different rates.
  tally?.add(tallyLabel, final.model ?? model, final.usage);

  if (final.stop_reason === "refusal") {
    const detail = final.stop_details?.explanation ?? final.stop_details?.category ?? "unknown";
    throw new Error(`Model declined the request (refusal: ${detail}).`);
  }
  if (final.stop_reason === "max_tokens") {
    process.stderr.write("\nwarning: output hit max_tokens — result may be truncated\n");
  }

  const fallbackRan = (final.usage.iterations ?? []).some(
    (entry) => entry.type === "fallback_message",
  );
  if (fallbackRan) {
    process.stderr.write(`\nnote: served by fallback model ${final.model}\n`);
  }

  const text = final.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!jsonSchema) return text;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Model returned unparseable JSON (${err.message}); raw output:\n${text}`);
  }
}
