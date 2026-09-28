import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

test("every brand token pairing passes WCAG AA in both themes", () => {
  // The brand palette is not automatically accessible: Chainlink Blue on
  // Chainlink Dark measures 2.92:1. Dark mode therefore uses brand Light Blue
  // instead — a decision someone will eventually try to "correct" back.
  try {
    execFileSync("node", ["scripts/check-contrast.mjs"], { encoding: "utf8" });
  } catch (err) {
    assert.fail(`contrast check failed:\n${err.stdout ?? ""}${err.stderr ?? ""}`);
  }
});

test("the published bundle embeds its fonts rather than fetching them", () => {
  // A strict CSP blocks external requests, so a font referenced by URL would
  // simply not load and the page would silently fall back.
  const file = "ui/dist-export/index.html";
  if (!fs.existsSync(file)) return; // only meaningful after a build
  const html = fs.readFileSync(file, "utf8");
  assert.ok(html.includes("data:font"), "no base64 font found in the export");
  assert.equal(
    (html.match(/https?:\/\/[^"')]*\.woff2/g) ?? []).length,
    0,
    "the export references an external font, which a strict CSP will block",
  );
});
