// Metadata checks — the most mechanical dimension in the rubric.
//
// Every value here is a MEASUREMENT, never a verdict. No score, grade, or
// severity field appears in the output: the auditor still assigns all scores,
// it just stops re-deriving facts a parser can settle exactly.

// Stopwords that signal an auto-generated `keywords` field built by splitting a
// sentence rather than extracting real terms.
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how",
  "in", "is", "it", "of", "on", "or", "that", "the", "to", "was", "what", "when",
  "where", "which", "with", "you", "your",
]);

// Template artifact left by generators that fill `about` from the title:
// {"@type":"Thing","name":"Vrf","description":"Content about vrf"}
const TEMPLATE_ABOUT = /^Content about /i;

/** Parse JSON-LD blocks, keeping parse failures visible rather than dropping them. */
function parseBlocks(jsonLd) {
  const parsed = [];
  const parseErrors = [];
  jsonLd.forEach((raw, i) => {
    try {
      parsed.push(JSON.parse(raw));
    } catch (err) {
      // A block the model would silently misread — surface it as a fact.
      parseErrors.push({ index: i, message: err.message, preview: raw.slice(0, 120) });
    }
  });
  return { parsed, parseErrors };
}

/** Flatten @graph containers so a nested TechArticle is still found. */
function flatten(objects) {
  return objects.flatMap((o) => (Array.isArray(o?.["@graph"]) ? o["@graph"] : [o])).filter(Boolean);
}

const typeOf = (o) => (Array.isArray(o?.["@type"]) ? o["@type"][0] : o?.["@type"]) ?? null;

/** Languages of fenced code blocks in the markdown, e.g. { ts: 5, solidity: 1 }. */
export function codeFenceLanguages(markdown) {
  const counts = {};
  for (const [, lang] of markdown.matchAll(/^ {0,3}(?:```|~~~)([A-Za-z][\w+-]*)/gm)) {
    const key = lang.toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// A declared language matches if it equals a fence language or a known alias of
// one. Without aliases, "TypeScript" vs a ```ts fence reads as a false mismatch.
const LANG_ALIASES = {
  typescript: ["ts", "tsx", "typescript"],
  javascript: ["js", "jsx", "javascript", "node"],
  solidity: ["solidity", "sol"],
  python: ["python", "py"],
  golang: ["go", "golang"],
  go: ["go", "golang"],
  rust: ["rust", "rs"],
  shell: ["sh", "bash", "shell", "zsh"],
  json: ["json", "jsonc"],
};

function languageMatches(declared, fenceLangs) {
  if (!declared) return null;
  const d = declared.toLowerCase().trim();
  const accepted = LANG_ALIASES[d] ?? [d];
  return accepted.some((a) => fenceLangs.includes(a));
}

/** Meta/link tags from the raw <head> snippet captured by extractPage. */
function headTags(headHtml) {
  if (!headHtml) return { canonical: null, ogTags: 0, twitterTags: 0, description: null };
  const attr = (re) => headHtml.match(re)?.[1] ?? null;
  return {
    canonical: attr(/<link[^>]+rel=["']?canonical["']?[^>]+href=["']([^"']+)["']/i),
    ogTags: (headHtml.match(/property=["']og:/gi) ?? []).length,
    twitterTags: (headHtml.match(/name=["']twitter:/gi) ?? []).length,
    description: attr(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
  };
}

/**
 * Measure the metadata layer of a page.
 * `page` is the object returned by extractPage: { headHtml, jsonLd, markdown }.
 */
export function checkMetadata({ headHtml = null, jsonLd = [], markdown = "" }) {
  const { parsed, parseErrors } = parseBlocks(jsonLd);
  const nodes = flatten(parsed);
  const types = nodes.map(typeOf).filter(Boolean);

  // The article-ish node carries the fields the rubric cares about.
  const article =
    nodes.find((n) => /Article|BlogPosting|LearningResource|WebPage/i.test(typeOf(n) ?? "")) ?? null;

  const fenceLangs = codeFenceLanguages(markdown);
  const fenceLangNames = Object.keys(fenceLangs);

  const declaredLanguage =
    article?.programmingLanguage ??
    (article?.additionalProperty ?? []).find((p) => /programming language/i.test(p?.name ?? ""))
      ?.value ??
    null;

  // Only a real comparison when the page actually has code to compare against.
  const languageMatch = fenceLangNames.length ? languageMatches(declaredLanguage, fenceLangNames) : null;

  const keywordsRaw = article?.keywords ?? null;
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map(String)
    : typeof keywordsRaw === "string"
      ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
      : [];
  const keywordStopwords = keywords.filter((k) => STOPWORDS.has(k.toLowerCase().replace(/[.,]/g, "")));

  const about = Array.isArray(article?.about) ? article.about : [];
  const aboutTemplateArtifacts = about.filter((a) => TEMPLATE_ABOUT.test(a?.description ?? "")).length;
  const aboutNames = about.map((a) => a?.name).filter(Boolean);

  const datePublished = article?.datePublished ?? null;
  const dateModified = article?.dateModified ?? null;

  return {
    jsonLdBlocks: jsonLd.length,
    parseErrors,
    types,
    hasArticleType: Boolean(article),
    ...headTags(headHtml),
    inLanguage: article?.inLanguage ?? null,
    datePublished,
    dateModified,
    // Published === modified means the page has never been revised, or the
    // generator stamps both — every audit so far has flagged this by hand.
    datesIdentical: Boolean(datePublished && dateModified && datePublished === dateModified),
    declaredProgrammingLanguage: declaredLanguage,
    codeFenceLanguages: fenceLangs,
    programmingLanguageMismatch: languageMatch === null ? null : !languageMatch,
    keywordCount: keywords.length,
    keywordStopwordCount: keywordStopwords.length,
    keywordStopwords,
    aboutEntries: about.length,
    aboutTemplateArtifacts,
    aboutDuplicateNames: aboutNames.length - new Set(aboutNames).size,
  };
}
