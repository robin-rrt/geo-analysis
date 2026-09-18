import { client } from "./src/claude.js";
import { buildRequest } from "./src/batch.js";
process.loadEnvFile(".env");

// Same request twice, differing only in cache TTL — the one variable that
// separates the failing real run from the passing minimal test.
const mk = (id, ttl) => {
  const r = buildRequest({
    customId: id,
    promptFile: "probe-eval.md",
    userContent: [
      { type: "text", text: "Source:\n" + "filler. ".repeat(3000), cache_control: ttl ? { type: "ephemeral", ttl } : { type: "ephemeral" } },
      { type: "text", text: 'Reply {"ok":true}' },
    ],
    model: "claude-sonnet-5",
    effort: "low",
    jsonSchema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
  });
  return r;
};

const b = await client().messages.batches.create({ requests: [mk("ttl-default", null), mk("ttl-1h", "1h")] });
let s = b;
while (s.processing_status !== "ended") {
  await new Promise((r) => setTimeout(r, 10000));
  s = await client().messages.batches.retrieve(b.id);
}
for await (const e of await client().messages.batches.results(b.id)) {
  const r = e.result;
  console.log(
    e.custom_id.padEnd(14),
    r.type.padEnd(10),
    r.type === "errored" ? JSON.stringify(r.error).slice(0, 220) : "ok",
  );
}
