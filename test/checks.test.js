import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runChecks,
  renderFacts,
  checkMetadata,
  checkStructure,
  checkCode,
  checkLinks,
  checkSpecifics,
} from "../src/checks/index.js";
import { scanFences, headings } from "../src/checks/structure.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Real page markdown snapshotted into probes.json by gen-probes. */
function realMarkdown() {
  const dir = path.join(root, "results");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name, "probes.json"))
    .filter((f) => fs.existsSync(f))
    .map((f) => ({
      slug: path.basename(path.dirname(f)),
      markdown: JSON.parse(fs.readFileSync(f, "utf8")).source_content,
    }))
    .filter((p) => p.markdown);
}

// The JSON-LD shape observed live on the VRF migration page, reproduced exactly
// so the regression test does not depend on the network.
const VRF_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "Migrate from Chainlink VRF to Chainlink CRE",
  inLanguage: "en-US",
  datePublished: "2026-07-23",
  dateModified: "2026-07-23",
  keywords: "Migrate, onchain, randomness, from, Chainlink, VRF, and, How",
  additionalProperty: [
    { "@type": "PropertyValue", name: "Programming Language", value: "Rust" },
  ],
  about: [
    { "@type": "Thing", name: "Migrate", description: "Content about migrate" },
    { "@type": "Thing", name: "Chainlink", description: "Content about chainlink" },
    { "@type": "Thing", name: "Chainlink", description: "Content about chainlink" },
  ],
});

const VRF_MARKDOWN = [
  "# Migrate from Chainlink VRF to Chainlink CRE",
  "",
  "```ts",
  'import { cre } from "@chainlink/cre-sdk";',
  "const x = 1;",
  "```",
  "",
  "```solidity",
  "pragma solidity ^0.8.0;",
  "contract A {}",
  "```",
].join("\n");

// ------------------------------------------------------------------ design --

test("facts contain measurements only — no verdict fields", () => {
  const facts = runChecks({ headHtml: null, jsonLd: [VRF_JSONLD], markdown: VRF_MARKDOWN });
  const banned = /^(score|grade|severity|verdict|rating|pass|fail|status)$/i;

  const walk = (obj, trail = "") => {
    if (obj === null || typeof obj !== "object") return;
    if (Array.isArray(obj)) return obj.forEach((v, i) => walk(v, `${trail}[${i}]`));
    for (const [k, v] of Object.entries(obj)) {
      assert.ok(!banned.test(k), `verdict field "${trail}.${k}" must not appear in facts`);
      walk(v, `${trail}.${k}`);
    }
  };
  walk(facts);
});

// ---------------------------------------------------------------- metadata --

test("catches the three real JSON-LD defects", () => {
  const m = checkMetadata({ jsonLd: [VRF_JSONLD], markdown: VRF_MARKDOWN });

  // 1. Declared language contradicts the actual code fences.
  assert.equal(m.declaredProgrammingLanguage, "Rust");
  assert.deepEqual(m.codeFenceLanguages, { ts: 1, solidity: 1 });
  assert.equal(m.programmingLanguageMismatch, true);

  // 2. keywords built by splitting a sentence, so stopwords leak in.
  assert.ok(m.keywordStopwordCount >= 3, `expected stopwords, got ${m.keywordStopwordCount}`);

  // 3. about entries are template artifacts, with a duplicate.
  assert.equal(m.aboutEntries, 3);
  assert.equal(m.aboutTemplateArtifacts, 3);
  assert.equal(m.aboutDuplicateNames, 1);

  assert.equal(m.datesIdentical, true);
});

test("language aliases prevent false mismatches", () => {
  const ld = (lang) =>
    JSON.stringify({ "@type": "TechArticle", programmingLanguage: lang });
  const md = "```ts\nconst a = 1;\n```";

  assert.equal(checkMetadata({ jsonLd: [ld("TypeScript")], markdown: md }).programmingLanguageMismatch, false);
  assert.equal(checkMetadata({ jsonLd: [ld("ts")], markdown: md }).programmingLanguageMismatch, false);
  assert.equal(checkMetadata({ jsonLd: [ld("Rust")], markdown: md }).programmingLanguageMismatch, true);
});

test("a page with no code cannot mismatch", () => {
  const m = checkMetadata({
    jsonLd: [JSON.stringify({ "@type": "TechArticle", programmingLanguage: "Rust" })],
    markdown: "# Concept page\n\nProse only.",
  });
  assert.equal(m.programmingLanguageMismatch, null, "no fences means the comparison is not applicable");
});

test("unparseable JSON-LD is surfaced, not silently dropped", () => {
  const m = checkMetadata({ jsonLd: ["{ not json", VRF_JSONLD], markdown: "" });
  assert.equal(m.parseErrors.length, 1);
  assert.equal(m.parseErrors[0].index, 0);
  assert.ok(m.hasArticleType, "the valid block is still parsed");
});

test("finds an article nested inside @graph", () => {
  const m = checkMetadata({
    jsonLd: [JSON.stringify({ "@graph": [{ "@type": "WebSite" }, { "@type": "TechArticle", keywords: "a, and" }] })],
    markdown: "",
  });
  assert.ok(m.hasArticleType);
  assert.equal(m.keywordCount, 2);
});

// --------------------------------------------------------------- structure --

test("fence scanner honours nesting and reports unclosed blocks", () => {
  // A 3-backtick fence inside a 4-backtick block must not close it.
  const nested = ["````md", "```ts", "const a = 1;", "```", "````"].join("\n");
  const s = scanFences(nested);
  assert.equal(s.total, 1, "the inner fence should not close the outer block");
  assert.deepEqual(s.unclosed, []);

  const unclosed = scanFences("```ts\nconst a = 1;\n");
  assert.deepEqual(unclosed.unclosed, [1], "reports the line the block opened on");

  assert.equal(scanFences("```\nplain\n```").untagged, 1);
});

test("headings ignore # inside code blocks", () => {
  const md = ["# Title", "", "```sh", "# this is a shell comment", "```", "", "## Real section"].join("\n");
  const hs = headings(md);
  assert.deepEqual(hs.map((h) => h.text), ["Title", "Real section"]);
});

test("detects heading level skips", () => {
  const s = checkStructure({ markdown: "# A\n\n### C\n" });
  assert.equal(s.h1Count, 1);
  assert.equal(s.headingLevelSkips.length, 1);
  assert.deepEqual(
    { from: s.headingLevelSkips[0].from, to: s.headingLevelSkips[0].to },
    { from: 1, to: 3 },
  );
});

// -------------------------------------------------------------------- code --

test("flags missing imports and undefined constants without false positives", () => {
  const md = [
    "```ts",
    "const tx = { chainSelector: CHAIN_SELECTOR };",
    "const n = Number.MAX_SAFE_INTEGER;",
    "console.log(tx, n);",
    "```",
  ].join("\n");
  const c = checkCode({ markdown: md });

  assert.equal(c.blocksNeedingImports, 1);
  assert.equal(c.blocksMissingImports, 1, "no import statement in a TS block");
  assert.ok(c.undefinedConstants.includes("CHAIN_SELECTOR"));
  assert.ok(
    !c.undefinedConstants.includes("MAX_SAFE_INTEGER"),
    "language builtins must not be reported as undefined",
  );
});

test("a block with imports is not flagged", () => {
  const md = ['```ts', 'import { x } from "y";', "const a = x;", "console.log(a);", "```"].join("\n");
  assert.equal(checkCode({ markdown: md }).blocksMissingImports, 0);
});

// ------------------------------------------------------------------- links --

test("splits internal from external and spots primary sources", () => {
  const md = [
    "[guide](/cre/guides/thing)",
    "[spec](https://www.ietf.org/rfc/rfc1234.txt)",
    "[same host](https://docs.chain.link/other)",
    "[here](https://example.com/x)",
  ].join("\n\n");
  const l = checkLinks({ markdown: md, finalUrl: "https://docs.chain.link/page" });

  assert.equal(l.totalLinks, 4);
  assert.equal(l.internalLinks, 2, "relative and same-host absolute are both internal");
  assert.equal(l.externalLinks, 2);
  assert.equal(l.primarySourceLinks, 1);
  assert.equal(l.opaqueLinkTexts, 1);
});

// --------------------------------------------------------------- specifics --

test("separates prose numerals from code numerals", () => {
  const md = ["Prose with no figures at all.", "", "```ts", "const gasLimit = 300000;", "```"].join("\n");
  const sp = checkSpecifics({ markdown: md });
  assert.equal(sp.numeralCount, 0, "prose genuinely has none");
  assert.ok(sp.codeNumeralCount > 0, "but the code does — reporting 0 alone would mislead");
});

test("counts measurements and vague quantifiers", () => {
  const sp = checkSpecifics({ markdown: "Responds in 500ms across a broad set of networks." });
  assert.ok(sp.measurementCount >= 1);
  assert.ok(sp.vagueQuantifiers.includes("broad set of"));
});

// ------------------------------------------------------- real page corpus --

test("runs clean over every real page snapshot", () => {
  const pages = realMarkdown();
  assert.ok(pages.length > 0, "expected probes.json snapshots under results/");

  for (const { slug, markdown } of pages) {
    const facts = runChecks({ markdown, jsonLd: [], headHtml: null });
    assert.ok(facts.structure.wordCount > 0, `${slug}: has words`);
    assert.deepEqual(facts.structure.unclosedFences, [], `${slug}: no unclosed fences`);

    const rendered = renderFacts(facts);
    assert.ok(rendered.includes("### Metadata"), `${slug}: renders metadata section`);
    assert.ok(!/undefined|NaN|\[object Object\]/.test(rendered), `${slug}: no leaked values`);
  }
});

test("rendered facts stay small enough to send on every audit", () => {
  const facts = runChecks({ headHtml: null, jsonLd: [VRF_JSONLD], markdown: VRF_MARKDOWN });
  const rendered = renderFacts(facts);
  assert.ok(rendered.length < 4000, `facts block is ${rendered.length} chars — too large to inline`);
});
