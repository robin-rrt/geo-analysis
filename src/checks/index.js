// Deterministic pre-checks: measure what a parser can settle exactly, so the
// auditor spends its judgment on what actually needs judgment.
//
// Design rule, enforced by test: facts contain MEASUREMENTS ONLY — no score,
// grade, severity, or verdict field. The rubric is qualitative ("clean semantic
// headings" is not `headingLevelSkips === 0`), so deriving scores from these
// numbers would trade honest variance for false precision.

import { checkMetadata } from "./metadata.js";
import { checkStructure } from "./structure.js";
import { checkLinks } from "./links.js";
import { checkCode } from "./code.js";
import { checkSpecifics } from "./specifics.js";

/** Run every check against an extractPage() result. */
export function runChecks(page) {
  return {
    metadata: checkMetadata(page),
    structure: checkStructure(page),
    links: checkLinks(page),
    code: checkCode(page),
    specifics: checkSpecifics(page),
  };
}

const list = (arr, empty = "none") => (arr?.length ? arr.join(", ") : empty);
const yn = (v) => (v === null || v === undefined ? "not applicable" : v ? "yes" : "no");

/**
 * Render facts as a compact Markdown block for the audit prompt.
 *
 * Kept terse on purpose: this rides in the volatile part of the user message on
 * every audit, so verbosity here is a per-request cost. It names the rubric
 * dimension each group bears on so the model can use it without being told twice.
 */
export function renderFacts(facts) {
  const { metadata: m, structure: s, links: l, code: c, specifics: sp } = facts;

  const lines = [];

  lines.push("### Metadata (dimension 6)");
  lines.push(
    `- JSON-LD: ${m.jsonLdBlocks} block(s), types [${list(m.types)}]` +
      (m.parseErrors.length ? `, **${m.parseErrors.length} FAILED TO PARSE**` : ", all parse"),
  );
  lines.push(`- canonical: ${m.canonical ?? "MISSING"} · inLanguage: ${m.inLanguage ?? "absent"}`);
  lines.push(
    `- datePublished ${m.datePublished ?? "absent"} / dateModified ${m.dateModified ?? "absent"}` +
      (m.datesIdentical ? " (identical — never revised or generator-stamped)" : ""),
  );
  if (m.declaredProgrammingLanguage || Object.keys(m.codeFenceLanguages).length) {
    lines.push(
      `- declared programmingLanguage: ${m.declaredProgrammingLanguage ?? "absent"} · ` +
        `actual code fences: ${JSON.stringify(m.codeFenceLanguages)} · ` +
        `mismatch: ${yn(m.programmingLanguageMismatch)}`,
    );
  }
  lines.push(
    `- keywords: ${m.keywordCount} entries, ${m.keywordStopwordCount} stopwords` +
      (m.keywordStopwords.length ? ` [${list(m.keywordStopwords)}]` : ""),
  );
  lines.push(
    `- about: ${m.aboutEntries} entries, ${m.aboutTemplateArtifacts} matching the auto-generated ` +
      `"Content about X" template, ${m.aboutDuplicateNames} duplicate name(s)`,
  );
  lines.push(`- og tags: ${m.ogTags} · twitter tags: ${m.twitterTags}`);

  lines.push("");
  lines.push("### Structure (dimension 2)");
  lines.push(
    `- ${s.headingCount} headings, ${s.h1Count} H1, max depth H${s.maxHeadingDepth}, ` +
      `${s.headingLevelSkips.length} level skip(s)`,
  );
  lines.push(
    `- ${s.sectionCount} sections · median ${s.medianSectionWords} words · ` +
      `max ${s.maxSectionWords} · ${s.oversizedSections} over 600 words`,
  );
  lines.push(`- ${s.tableCount} table(s), ${s.bulletCount} bullet(s), ${s.wordCount} words total`);

  lines.push("");
  lines.push("### Code (dimension 7)");
  lines.push(
    `- ${c.codeBlocks} fenced block(s), ${c.substantiveBlocks} substantive (3+ lines), ` +
      `${c.untaggedBlocks} untagged` +
      (c.unclosedFences.length ? `, UNCLOSED at line(s) ${list(c.unclosedFences)}` : ""),
  );
  lines.push(`- languages: [${list(c.languages)}]`);
  lines.push(
    `- of ${c.blocksNeedingImports} block(s) in languages that need imports, ` +
      `${c.blocksMissingImports} show none`,
  );
  lines.push(`- ${c.placeholderBlocks} block(s) contain placeholder comments`);
  if (c.undefinedConstants.length) {
    lines.push(`- identifiers used but never assigned: ${list(c.undefinedConstants)}`);
  }

  lines.push("");
  lines.push("### Citations (dimension 4)");
  lines.push(
    `- ${l.totalLinks} link(s): ${l.internalLinks} internal, ${l.externalLinks} external, ` +
      `${l.primarySourceLinks} to primary sources [${list(l.primarySourceHosts)}]`,
  );
  if (l.opaqueLinkTexts) lines.push(`- ${l.opaqueLinkTexts} link(s) with opaque text ("here", "this")`);

  lines.push("");
  lines.push("### Specifics (dimension 3)");
  lines.push(
    `- prose: ${sp.numeralCount} numerals (${sp.numeralDensityPer1kWords} per 1k words), ` +
      `${sp.measurementCount} with units, ${sp.hexIdentifierCount} hex identifiers`,
  );
  lines.push(
    `- code blocks contain a further ${sp.codeNumeralCount} numeral(s)` +
      (sp.numeralCount === 0 && sp.codeNumeralCount > 0
        ? " — this page's specifics live entirely in code, not prose"
        : ""),
  );
  lines.push(`- version strings: [${list(sp.versionStrings)}]`);
  if (sp.vagueQuantifierCount) {
    lines.push(`- vague quantifiers present: ${list(sp.vagueQuantifiers)}`);
  }

  return lines.join("\n");
}

export { checkMetadata, checkStructure, checkLinks, checkCode, checkSpecifics };
