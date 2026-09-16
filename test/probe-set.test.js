import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceHash, probeSetId } from "../src/probe-set.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const probes = [
  {
    id: "p01",
    prompt: "How do I generate randomness in a CRE workflow?",
    archetype: "direct-howto",
    paraphrase_of: null,
    expected_source_urls: ["https://docs.chain.link/cre/guides/workflow/using-randomness"],
    answer_key: {
      must_include: ["Use runtime.Rand()"],
      correct_entities: { functions: ["runtime.Rand()"], imports_or_packages: [], params_or_config: [], identifiers: [] },
      correct_step_order: [],
      common_hallucinations: ["Suggesting Chainlink VRF"],
      out_of_scope: [],
    },
  },
];

test("probeSetId survives reformatting and key reordering", () => {
  const reformatted = JSON.parse(JSON.stringify(probes, null, 4));
  const [p] = probes;
  const reordered = [{ answer_key: { ...p.answer_key }, expected_source_urls: p.expected_source_urls, archetype: p.archetype, prompt: p.prompt, paraphrase_of: null, id: p.id }];
  assert.equal(probeSetId(reformatted), probeSetId(probes));
  assert.equal(probeSetId(reordered), probeSetId(probes));
  assert.match(probeSetId(probes), /^[0-9a-f]{12}$/);
});

test("probeSetId changes when a probe's content changes", () => {
  const edited = structuredClone(probes);
  edited[0].prompt += " (Go)";
  assert.notEqual(probeSetId(edited), probeSetId(probes));

  const rekeyed = structuredClone(probes);
  rekeyed[0].answer_key.must_include.push("Check the error");
  assert.notEqual(probeSetId(rekeyed), probeSetId(probes));
});

test("stored probe sets get distinct ids and source hashes", () => {
  const sets = ["workflow-using-randomness", "concepts-non-determinism-go"].map((slug) =>
    JSON.parse(fs.readFileSync(path.join(root, "results", slug, "probes.json"), "utf8")),
  );
  const ids = sets.map((s) => probeSetId(s.probes));
  assert.notEqual(ids[0], ids[1]);
  // generated_at is set-level metadata the model invented; it is not part of the id.
  const [first] = sets;
  assert.equal(probeSetId({ ...first, generated_at: "2099-01-01" }.probes), ids[0]);
  assert.match(sourceHash(first.source_content), /^[0-9a-f]{12}$/);
  assert.notEqual(sourceHash(first.source_content), sourceHash(first.source_content + " "));
});
