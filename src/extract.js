import * as cheerio from "cheerio";
import TurndownService from "turndown";
import turndownPluginGfm from "turndown-plugin-gfm";
import { runChecks, renderFacts } from "./checks/index.js";

const USER_AGENT =
  "geo-analyze/0.1 (+https://github.com/robin/geo-analysis; GEO audit bot)";

// Elements that are never part of the main content.
const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "[role=navigation]",
  "[role=banner]",
  "[role=contentinfo]",
  "[aria-hidden=true]",
  ".sidebar",
  ".toc",
  ".breadcrumb",
  ".breadcrumbs",
  ".cookie-banner",
  ".skip-link",
];

// Candidate containers for the main content, in priority order.
const MAIN_SELECTORS = ["main", "article", "[role=main]", "#content", ".content", "body"];

/**
 * Fetch a URL and extract everything the GEO audit needs:
 * head metadata (raw), JSON-LD blocks, and main content as GFM markdown.
 */
export async function extractPage(url) {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();

  // Markdown source served directly (e.g. a .md endpoint) — no HTML to parse.
  if (contentType.includes("markdown") || /\.md(\?|#|$)/.test(url)) {
    return {
      title: firstHeading(body) ?? url,
      finalUrl: res.url,
      headHtml: null,
      jsonLd: [],
      markdown: body,
    };
  }

  const $ = cheerio.load(body);

  // --- <head> metadata, passed raw so the model can verify canonical/OG/dates ---
  const headBits = [];
  const title = $("head > title").text().trim();
  if (title) headBits.push(`<title>${title}</title>`);
  $("head link[rel=canonical]").each((_, el) => headBits.push($.html(el).trim()));
  $("head meta").each((_, el) => {
    const name = $(el).attr("name") ?? $(el).attr("property") ?? $(el).attr("http-equiv");
    // Keep semantically meaningful meta only; skip charset/viewport noise.
    if (name && !/^(viewport|charset|theme-color|color-scheme)$/i.test(name)) {
      headBits.push($.html(el).trim());
    }
  });

  // --- JSON-LD blocks (anywhere in the document) ---
  const jsonLd = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).text().trim();
    if (raw) jsonLd.push(raw);
  });

  // --- Main content → GFM markdown ---
  $(NOISE_SELECTORS.join(",")).remove();
  let $main;
  for (const sel of MAIN_SELECTORS) {
    const found = $(sel).first();
    if (found.length && found.text().trim().length > 200) {
      $main = found;
      break;
    }
  }
  $main ??= $("body");

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  turndown.use(turndownPluginGfm.gfm);
  const markdown = turndown.turndown($.html($main)).trim();

  return {
    title: title || $main.find("h1").first().text().trim() || url,
    finalUrl: res.url,
    headHtml: headBits.length ? headBits.join("\n") : null,
    jsonLd,
    markdown,
  };
}

/**
 * Assemble the PAGE_CONTENT block injected into the audit prompt.
 *
 * The measured-facts block rides here, in the volatile user message, rather than
 * in the cached system prompt — it is page-specific, so putting it in the prefix
 * would invalidate the cache on every audit.
 */
export function buildPageContent(page, { facts = true } = {}) {
  const { headHtml, jsonLd, markdown } = page;
  const sections = [];

  // `facts: false` reproduces the pre-checks behaviour, so the effect of the
  // facts block on scores and rankings stays measurable rather than asserted.
  if (facts) {
    sections.push(
      `## Measured facts (computed deterministically — treat as ground truth)\n\n` +
        renderFacts(runChecks(page)),
    );
  }

  if (headHtml) {
    sections.push(`## Extracted <head> metadata\n\n\`\`\`html\n${headHtml}\n\`\`\``);
  } else {
    sections.push(
      "## Extracted <head> metadata\n\n(none captured — head metadata could not be verified)",
    );
  }

  if (jsonLd.length) {
    const blocks = jsonLd.map((b) => `\`\`\`json\n${b}\n\`\`\``).join("\n\n");
    sections.push(`## JSON-LD blocks\n\n${blocks}`);
  } else {
    sections.push("## JSON-LD blocks\n\n(none found in the served HTML)");
  }

  sections.push(`## Main content (rendered markdown)\n\n${markdown}`);
  return sections.join("\n\n---\n\n");
}

function firstHeading(markdown) {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}
