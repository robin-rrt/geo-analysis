import test from "node:test";
import assert from "node:assert/strict";
import { redact, redactValue } from "../src/server/redact.js";

const KEY = "sk-ant-api03-REALKEYMATERIAL1234567890";

test("a live key is removed from any text that leaves the process", () => {
  const out = redact(`failed calling api with ${KEY}`, { ANTHROPIC_API_KEY: KEY });
  assert.ok(!out.includes(KEY), "the key survived redaction");
  assert.match(out, /\[redacted\]/);
});

test("a key is removed even when it is not the configured one", () => {
  const out = redact(`leaked ${KEY}`, {});
  assert.ok(!out.includes("REALKEYMATERIAL"));
});

test("redaction reaches into nested error payloads", () => {
  const payload = { error: { message: `bad request for ${KEY}`, nested: [KEY] } };
  const out = redactValue(payload, { ANTHROPIC_API_KEY: KEY });
  const text = JSON.stringify(out);
  assert.ok(!text.includes("REALKEYMATERIAL"), `key leaked: ${text}`);
});

test("redaction leaves ordinary text alone", () => {
  assert.equal(redact("nothing secret here", {}), "nothing secret here");
});

test("a short or empty key setting cannot blank out the whole string", () => {
  assert.equal(redact("aaa", { ANTHROPIC_API_KEY: "" }), "aaa");
  assert.equal(redact("aaa", { ANTHROPIC_API_KEY: "a" }), "aaa");
});
