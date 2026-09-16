import test from "node:test";
import assert from "node:assert/strict";
import { genProbes, MIN_SOURCE_CHARS } from "../src/probes.js";

// Observed live on 2026-09-16: docs.chain.link/cre/guides/workflow/using-randomness
// extracted to 238 characters of nav shell and a newsletter form, and gen-probes
// generated ten probes whose answer keys asserted only that the page is the
// canonical source. Nothing here touches the network or the API: the page is
// supplied, and the guard throws before any model call.
const thinPage = {
  markdown:
    "For AI agents: use [llms.txt](/llms.txt) as the documentation index.\n\nOn this page\n\n# Using Randomness in Workflows\n\n## Get the latest Chainlink content straight to your inbox.\n\nEmail Address",
  finalUrl: "https://docs.chain.link/cre/guides/workflow/using-randomness",
  title: "Using Randomness in Workflows",
};

test("refuses to generate probes from a page that extracted to almost nothing", async () => {
  assert.ok(thinPage.markdown.length < MIN_SOURCE_CHARS);
  await assert.rejects(
    genProbes({ url: thinPage.finalUrl, page: thinPage, n: 10, model: "m", effort: "high" }),
    (err) => {
      assert.match(err.message, /extracted only \d+ characters/);
      assert.match(err.message, /--dump-content/);
      assert.match(err.message, /--allow-thin/);
      return true;
    },
  );
});
