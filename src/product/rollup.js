// Aggregate per-page T0 facts into a product-level view.
//
// Two rules borrowed from the teammate's crawler, both about not lying with
// denominators:
//
//   1. Each check reports `evaluatedPages` — only the pages it could actually
//      assess. A check that cannot run on a page must not count that page as a
//      failure.
//   2. Scoring is graduated: (passing + 0.5 x warn) / evaluated.
//
// No LLM is involved. This tier is free and runs over every page.

import { runChecks } from "../checks/index.js";

/**
 * A check definition: given one page's facts, return
 *   null    -> not applicable, page is excluded from this check's denominator
 *   "pass"  -> no finding
 *   "warn"  -> soft finding
 *   "fail"  -> hard finding
 * plus an optional detail string for the findings list.
 */
const CHECKS = [
  {
    id: "jsonld-valid",
    weight: 8,
    describe: "JSON-LD present and parseable",
    htmlOnly: true,
    assess: (f) => {
      if (!f.metadata.jsonLdBlocks) return { verdict: "warn", detail: "no JSON-LD block" };
      if (f.metadata.parseErrors.length) {
        return { verdict: "fail", detail: `${f.metadata.parseErrors.length} block(s) fail JSON.parse` };
      }
      return { verdict: "pass" };
    },
  },
  {
    id: "declared-language",
    weight: 10,
    htmlOnly: true,
    describe: "Declared programmingLanguage matches the code on the page",
    assess: (f) => {
      // Only applicable where the page declares a language AND has code.
      if (f.metadata.programmingLanguageMismatch === null) return null;
      return f.metadata.programmingLanguageMismatch
        ? {
            verdict: "fail",
            detail: `declares ${f.metadata.declaredProgrammingLanguage}, fences are ${Object.keys(f.metadata.codeFenceLanguages).join("/")}`,
          }
        : { verdict: "pass" };
    },
  },
  {
    id: "entity-metadata",
    weight: 6,
    htmlOnly: true,
    describe: "about/keywords carry real entities, not template artifacts",
    assess: (f) => {
      const m = f.metadata;
      if (!m.aboutEntries && !m.keywordCount) return null;
      const artifacts = m.aboutEntries && m.aboutTemplateArtifacts === m.aboutEntries;
      if (artifacts) return { verdict: "fail", detail: `${m.aboutTemplateArtifacts}/${m.aboutEntries} template about entries` };
      if (m.keywordStopwordCount > 0 || m.aboutTemplateArtifacts > 0) {
        return { verdict: "warn", detail: `${m.keywordStopwordCount} stopword keyword(s), ${m.aboutTemplateArtifacts} template about entries` };
      }
      return { verdict: "pass" };
    },
  },
  {
    id: "canonical",
    weight: 4,
    htmlOnly: true,
    describe: "Canonical URL present",
    assess: (f) => (f.metadata.canonical ? { verdict: "pass" } : { verdict: "warn", detail: "no canonical link" }),
  },
  {
    id: "freshness",
    weight: 3,
    htmlOnly: true,
    describe: "Published and modified dates differ (page has been revised)",
    assess: (f) => {
      if (!f.metadata.datePublished && !f.metadata.dateModified) {
        return { verdict: "warn", detail: "no dates in schema" };
      }
      return f.metadata.datesIdentical
        ? { verdict: "warn", detail: "published === modified" }
        : { verdict: "pass" };
    },
  },
  {
    id: "code-fence-validity",
    weight: 5,
    describe: "Code fences are closed and language-tagged",
    assess: (f) => {
      if (!f.structure.codeFences) return null;
      if (f.structure.unclosedFences.length) {
        return { verdict: "fail", detail: `unclosed fence at line ${f.structure.unclosedFences[0]}` };
      }
      return f.structure.untaggedFences
        ? { verdict: "warn", detail: `${f.structure.untaggedFences} untagged fence(s)` }
        : { verdict: "pass" };
    },
  },
  {
    id: "heading-structure",
    weight: 4,
    describe: "One H1, no skipped heading levels",
    assess: (f) => {
      const s = f.structure;
      if (!s.headingCount) return null;
      if (s.h1Count !== 1) return { verdict: "warn", detail: `${s.h1Count} H1 headings` };
      return s.headingLevelSkips.length
        ? { verdict: "warn", detail: `${s.headingLevelSkips.length} level skip(s)` }
        : { verdict: "pass" };
    },
  },
  {
    id: "code-runnability",
    weight: 8,
    describe: "Substantive snippets show their imports",
    assess: (f) => {
      if (!f.code.blocksNeedingImports) return null;
      return f.code.blocksMissingImports
        ? { verdict: "warn", detail: `${f.code.blocksMissingImports}/${f.code.blocksNeedingImports} blocks without imports` }
        : { verdict: "pass" };
    },
  },
  {
    id: "external-citations",
    weight: 6,
    describe: "Links out to primary sources",
    assess: (f) => {
      if (!f.links.totalLinks) return null;
      if (!f.links.externalLinks) return { verdict: "warn", detail: "no external links" };
      return f.links.primarySourceLinks ? { verdict: "pass" } : { verdict: "warn", detail: "external links but no primary sources" };
    },
  },
  {
    id: "prose-specifics",
    weight: 5,
    describe: "Concrete numbers appear in prose, not only in code",
    assess: (f) => {
      const sp = f.specifics;
      if (sp.proseWordCount < 100) return null; // too short to judge
      if (sp.numeralCount === 0 && sp.codeNumeralCount > 0) {
        return { verdict: "warn", detail: "all specifics live in code blocks" };
      }
      return sp.numeralCount ? { verdict: "pass" } : { verdict: "warn", detail: "no numerals in prose" };
    },
  },
];

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Roll fetched pages up into a product view.
 * `pages` come from fetchProduct(); entries without a page body are skipped
 * from every check's denominator but still counted as unfetched.
 */
export function rollup(product, scope, pages) {
  const usable = pages.filter((p) => p.fetched && p.page);
  const facts = usable.map((p) => ({
    entry: p,
    facts: runChecks(p.page),
    format: p.page.format ?? "html",
  }));

  const checks = CHECKS.map((check) => {
    const assessments = [];
    for (const { entry, facts: f, format } of facts) {
      // Markdown endpoints have no <head>, so HTML-layer checks cannot assess
      // them. Counting that absence as a finding would penalise a page for
      // being served in the format llms.txt asks agents to prefer.
      if (check.htmlOnly && format !== "html") continue;
      const result = check.assess(f);
      if (result === null) continue; // not applicable — excluded from denominator
      assessments.push({ url: entry.url, ...result });
    }

    const evaluated = assessments.length;
    const counts = { pass: 0, warn: 0, fail: 0 };
    for (const a of assessments) counts[a.verdict] += 1;

    // (passing + 0.5 x warn) / evaluated — graduated, and blind to pages the
    // check could not assess.
    const points = evaluated ? (counts.pass + 0.5 * counts.warn) / evaluated : null;

    return {
      id: check.id,
      describe: check.describe,
      weight: check.weight,
      evaluatedPages: evaluated,
      notApplicable: usable.length - evaluated,
      ...counts,
      points: points === null ? null : round(points, 3),
      // Worst-first, capped: enough to act on without dumping the corpus.
      findings: assessments
        .filter((a) => a.verdict !== "pass")
        .sort((a, b) => (a.verdict === "fail" ? -1 : 1) - (b.verdict === "fail" ? -1 : 1))
        .slice(0, 25),
    };
  });

  // Weighted score over checks that actually ran. A check with no applicable
  // pages contributes nothing and does not dilute the result.
  const scored = checks.filter((c) => c.points !== null);
  const weight = scored.reduce((sum, c) => sum + c.weight, 0);
  const score = weight ? round((scored.reduce((sum, c) => sum + c.points * c.weight, 0) / weight) * 100, 1) : null;

  return {
    product,
    scope,
    generatedAt: new Date().toISOString(),
    score,
    scoredWeight: weight,
    counts: {
      inScope: pages.length,
      fetched: usable.length,
      unfetched: pages.length - usable.length,
    },
    checks: checks.sort((a, b) => (a.points ?? 1) - (b.points ?? 1)),
    // Ranked by recoverable points: weight x the share still missing. Mirrors
    // the teammate's "potential fixes" ordering — impact, not salience.
    potentialFixes: scored
      .map((c) => ({
        id: c.id,
        describe: c.describe,
        pages: c.warn + c.fail,
        recoverable: round((c.weight * (1 - c.points)) / weight * 100, 2),
      }))
      .filter((f) => f.recoverable > 0)
      .sort((a, b) => b.recoverable - a.recoverable),
  };
}

export { CHECKS };
