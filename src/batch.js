// Batched grading via the Message Batches API — 50% of standard rates.
//
// Grading is the ideal batch workload: every call is independent, none is
// interactive, and order does not matter. Three constraints shape this file:
//
//   1. Batch requests are non-streaming, so this cannot reuse runClaude().
//   2. The Batch API rejects the `fallbacks` parameter, so the Fable refusal
//      fallback is unavailable here — callers must not batch at --effort max.
//   3. Results come back in arbitrary order and are keyed by custom_id.

import fs from "node:fs";
import path from "node:path";
import { client, PROMPTS_DIR } from "./claude.js";

const POLL_INTERVAL_MS = 15_000;
const MAX_WAIT_MS = 24 * 60 * 60 * 1000; // the API's own ceiling

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Build one batch request. Mirrors the shape runClaude() sends, minus streaming
 * and minus `fallbacks` — if those drift apart, batched and synchronous grades
 * stop being comparable.
 */
export function buildRequest({ customId, promptFile, userContent, model, effort, jsonSchema }) {
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, promptFile), "utf8");
  return {
    custom_id: customId,
    params: {
      model,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: {
        effort,
        ...(jsonSchema && { format: { type: "json_schema", schema: jsonSchema } }),
      },
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
    },
  };
}

/** Text of a completed batch message, or null when it produced none. */
function textOf(message) {
  return (
    (message?.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("") || null
  );
}

/**
 * Submit requests, wait for the batch to finish, and return results keyed by
 * `custom_id`. Each entry is `{ ok, value | error, usage, model }`; a single
 * failed request never fails the batch, so one bad probe cannot lose the rest.
 */
export async function runBatch({ requests, log = () => {}, pollMs = POLL_INTERVAL_MS }) {
  if (!requests.length) return new Map();

  const batch = await client().messages.batches.create({ requests });
  log(`batch ${batch.id} submitted with ${requests.length} request(s)\n`);

  const startedAt = Date.now();
  let status = batch;
  while (status.processing_status !== "ended") {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(`batch ${batch.id} did not finish within 24h`);
    }
    await sleep(pollMs);
    status = await client().messages.batches.retrieve(batch.id);
    const c = status.request_counts ?? {};
    log(
      `  ${status.processing_status}: ${c.succeeded ?? 0} succeeded, ${c.processing ?? 0} processing` +
        `${c.errored ? `, ${c.errored} errored` : ""}\n`,
    );
  }

  // Keyed by custom_id — never by position; the API makes no ordering promise.
  const out = new Map();
  for await (const entry of await client().messages.batches.results(batch.id)) {
    const r = entry.result;
    if (r.type === "succeeded") {
      out.set(entry.custom_id, {
        ok: true,
        value: textOf(r.message),
        usage: r.message?.usage ?? null,
        model: r.message?.model ?? null,
        stopReason: r.message?.stop_reason ?? null,
      });
    } else {
      out.set(entry.custom_id, {
        ok: false,
        error: r.error?.message ?? r.type,
        usage: null,
        model: null,
      });
    }
  }
  return out;
}

/** Parse a batch entry that was expected to carry JSON (structured output). */
export function parseJsonEntry(entry, customId) {
  if (!entry) return { ok: false, error: `no batch result for ${customId}` };
  if (!entry.ok) return entry;
  if (entry.stopReason === "refusal") {
    return { ok: false, error: "grader refused", usage: entry.usage, model: entry.model };
  }
  try {
    return { ok: true, value: JSON.parse(entry.value), usage: entry.usage, model: entry.model };
  } catch (err) {
    return { ok: false, error: `unparseable JSON from grader: ${err.message}`, usage: entry.usage };
  }
}
