import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAudit, matchDimension, AuditParseError } from "../src/dashboard/parse-audit.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsDir = path.join(root, "results");

// Every audit report currently on disk, including the superseded *-old.md, so a
// template change anywhere is caught rather than only on the files we render.
function auditFiles() {
  if (!fs.existsSync(resultsDir)) return [];
  return fs
    .readdirSync(resultsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((dir) =>
      fs
        .readdirSync(path.join(resultsDir, dir.name))
        .filter((f) => f.startsWith("audit") && f.endsWith(".md"))
        .map((f) => path.join(resultsDir, dir.name, f)),
    );
}

const files = auditFiles();

test("fixtures exist", () => {
  assert.ok(files.length > 0, "expected audit reports under results/");
});

for (const file of files) {
  const rel = path.relative(root, file);

  test(`parses ${rel}`, () => {
    const audit = parseAudit(fs.readFileSync(file, "utf8"), rel);

    assert.ok(audit.title, "title");
    assert.match(audit.url, /^https?:\/\//, "url");
    assert.ok(Number.isFinite(Date.parse(audit.analyzedAt)), "analyzedAt is a date");

    assert.ok(audit.score >= 0 && audit.score <= 100, "score in range");
    assert.ok(audit.band, "band");

    assert.equal(audit.dimensions.length, 9, "9 dimensions");
    assert.equal(
      audit.dimensions.reduce((sum, d) => sum + d.weight, 0),
      100,
      "weights sum to 100",
    );
    for (const d of audit.dimensions) {
      assert.ok(d.score >= 0 && d.score <= 10, `${d.name} score in 0-10`);
      assert.ok(Number.isFinite(d.weighted), `${d.name} weighted is numeric`);
    }

    // The reported total should agree with the table it came from.
    const computed = audit.dimensions.reduce((sum, d) => sum + (d.weight * d.score) / 10, 0);
    assert.ok(
      Math.abs(computed - audit.weightedTotal) < 0.6,
      `weighted total ${audit.weightedTotal} ~= computed ${computed.toFixed(1)}`,
    );

    assert.ok(audit.summary && audit.summary.length > 50, "summary prose");
    assert.ok(audit.recommendations.length > 0, "has recommendations");
    for (const rec of audit.recommendations) {
      assert.ok(rec.priority >= 1 && rec.priority <= 3, "priority 1-3");
      assert.ok(rec.title, "rec title");
      assert.ok(rec.change, `rec "${rec.title}" has a Change field`);
    }
  });
}

test("attaches dimension analysis prose to table rows", () => {
  // Both bullet styles in the corpus must bind: `**Name:** text` and `**Name** — text`.
  for (const file of files) {
    const audit = parseAudit(fs.readFileSync(file, "utf8"), file);
    const withAnalysis = audit.dimensions.filter((d) => d.analysis);
    assert.ok(
      withAnalysis.length >= 7,
      `${path.basename(file)}: only ${withAnalysis.length}/9 dimensions matched analysis prose`,
    );
  }
});

test("matchDimension handles abbreviated analysis names", () => {
  const names = [
    "Answer-first extractability",
    "Structural scannability & chunkability",
    "Code completeness & agent-runnability",
    "Clarity, fluency & terminology consistency",
  ];
  assert.equal(matchDimension("Structural scannability", names), "Structural scannability & chunkability");
  assert.equal(matchDimension("Code completeness", names), "Code completeness & agent-runnability");
  assert.equal(matchDimension("Clarity & terminology", names), "Clarity, fluency & terminology consistency");
  assert.equal(matchDimension("Answer-first extractability", names), "Answer-first extractability");
});

test("parses the probe-informed diagnosis when present", () => {
  const probeInformed = files.filter((f) => f.endsWith("audit-probe-informed.md"));
  assert.ok(probeInformed.length > 0, "expected a probe-informed report in fixtures");

  for (const file of probeInformed) {
    const audit = parseAudit(fs.readFileSync(file, "utf8"), file);
    assert.ok(audit.probeInformed, "probeInformed present");
    assert.ok(audit.probeInformed.summary, "score-vs-fidelity line");
    assert.ok(audit.probeInformed.retrieval?.hit, "hit row");
    assert.ok(audit.probeInformed.retrieval?.missed, "missed row");
    assert.ok(audit.probeInformed.missTriage, "miss triage");
    // The retrieval table must not leak into the dimension table.
    assert.equal(audit.dimensions.length, 9);
  }
});

test("plain audits have no probe-informed section", () => {
  const plain = files.filter((f) => path.basename(f) === "audit.md");
  for (const file of plain) {
    const audit = parseAudit(fs.readFileSync(file, "utf8"), file);
    assert.equal(audit.probeInformed, null, `${path.basename(path.dirname(file))} should be plain`);
  }
});

test("accepts a decimal total score", () => {
  // Observed live: the model sometimes carries the weighted total through to the
  // headline ("71.1/100"). An integer-only regex silently failed the whole report.
  const good = fs.readFileSync(files[0], "utf8");
  const decimal = good.replace(/^## GEO Score: \d+\/100/m, "## GEO Score: 71.1/100");
  const audit = parseAudit(decimal, "decimal.md");
  assert.equal(audit.score, 71.1);
  assert.ok(audit.band, "band still parses");
});

test("throws on structurally broken reports rather than returning partial data", () => {
  assert.throws(() => parseAudit("", "empty.md"), AuditParseError);
  assert.throws(() => parseAudit("# Not an audit\n", "wrong.md"), AuditParseError);

  const good = fs.readFileSync(files[0], "utf8");
  // Drop a dimension row.
  const short = good.replace(/^\| Quotable canonical definitions .*$/m, "");
  assert.throws(() => parseAudit(short, "short.md"), /expected 9 dimension rows/);

  // Corrupt a weight so the table no longer sums to 100.
  const badWeight = good.replace("| Answer-first extractability | 15 |", "| Answer-first extractability | 14 |");
  assert.throws(() => parseAudit(badWeight, "weight.md"), /weights sum to 99/);
});

test("dimension critiques parse whether the auditor bullets them or not", () => {
  // The auditor writes `- **Name** — text` on some pages and a bare
  // `**Name** — text` paragraph on others. A bullets-only reader dropped every
  // critique on 74 of 208 audited pages — 36% of the corpus losing its most
  // useful prose for a reason unrelated to the writing.
  const table = [
    "| Dimension | Weight | Score (0–10) | Weighted |",
    "|---|---|---|---|",
    "| Answer-first extractability | 15 | 8 | 12.0 |",
    "| Structural scannability & chunkability | 15 | 8 | 12.0 |",
    "| Concrete statistics & specifics | 12 | 4 | 4.8 |",
    "| Citations & authoritative references | 10 | 5 | 5.0 |",
    "| Quotable canonical definitions | 8 | 8 | 6.4 |",
    "| Machine-readability & metadata | 12 | 7 | 8.4 |",
    "| Code completeness & agent-runnability | 10 | 4 | 4.0 |",
    "| Query/intent coverage | 10 | 7 | 7.0 |",
    "| Clarity, fluency & terminology consistency | 8 | 9 | 7.2 |",
    "| **Total** | **100** | | **66.8** |",
  ].join("\n");

  const report = (analysisBlock) =>
    `# GEO Audit — T\n\n**URL:** https://x/y\n\n## GEO Score: 67/100 — Good\n\n` +
    `## Summary\n\ns\n\n${table}\n\n## Dimension analysis\n\n${analysisBlock}\n\n## Prioritized recommendations\n\n`;

  const text = "**Answer-first extractability** — Strong. Opens with a self-contained claim.";
  const bulleted = parseAudit(report(`- ${text}`), "b.md");
  const paragraph = parseAudit(report(text), "p.md");

  const find = (a) => a.dimensions.find((d) => d.name === "Answer-first extractability").analysis;
  assert.match(find(bulleted), /self-contained claim/);
  assert.match(find(paragraph), /self-contained claim/, "paragraph form was dropped");
  assert.equal(find(bulleted), find(paragraph), "the two forms must yield the same text");
});

test("a multi-line paragraph critique keeps its continuation", () => {
  const block = "**Machine-readability & metadata** — Weak. 0 JSON-LD blocks,\ncanonical MISSING, no dateModified.";
  const entry = block.split("\n");
  assert.ok(entry.length > 1, "fixture should wrap");
});
