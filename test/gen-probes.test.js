import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { genProbes, MIN_SOURCE_CHARS, PROBES_SCHEMA } from "../src/probes.js";

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

// The generator follows the worked template in the prompt over the JSON schema,
// so the two have to agree. They did not: `context_mode` was added to the schema
// and to the prose ("Set context_mode on every probe") but never to the template
// sitting under "return exactly this JSON". Three probe sets were generated
// after that change and none carried the field — 0 of 774 probes on disk have
// it, so every one of them is a measurement that cannot say whether a low score
// means bad docs or an undiscoverable page. A field missing from a template is
// invisible; this makes it loud.
test("the prompt's worked example carries every field the schema requires", () => {
  const md = fs.readFileSync("prompts/gen-probes.md", "utf8");
  const start = md.indexOf("{", md.indexOf("## Output schema"));
  const end = md.lastIndexOf("}", md.indexOf("\nRules:"));
  // Placeholders like <the source URL> and <N> are not JSON; make them strings.
  const json = md
    .slice(start, end + 1)
    .replace(/<[^>\n]*>/g, "x")
    .replace(/:\s*x(?=[,\n])/g, ': "x"');
  const template = JSON.parse(json);

  const required = PROBES_SCHEMA.properties.probes.items.required;
  const present = Object.keys(template.probes[0]);
  for (const field of required) {
    assert.ok(present.includes(field), `template omits required probe field "${field}"`);
  }
});
