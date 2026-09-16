import { extractPage } from "./extract.js";
import { runClaude } from "./claude.js";

const str = { type: "string" };
const strArr = { type: "array", items: str };

// Structured-output schema for the probe set — guarantees parseable JSON.
export const PROBES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "source_url",
    "source_title",
    "generated_at",
    "product_context",
    "probe_count",
    "probes",
  ],
  properties: {
    source_url: str,
    source_title: str,
    generated_at: str,
    product_context: str,
    probe_count: { type: "integer" },
    probes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "prompt",
          "archetype",
          "paraphrase_of",
          "expected_source_urls",
          "answer_key",
        ],
        properties: {
          id: str,
          prompt: str,
          archetype: {
            type: "string",
            enum: [
              "direct-howto",
              "constrained",
              "code-first",
              "error-debug",
              "comparison",
              "terse/keyword",
              "verbose/beginner",
              "paraphrase",
              "multilingual",
            ],
          },
          paraphrase_of: { anyOf: [str, { type: "null" }] },
          expected_source_urls: strArr,
          answer_key: {
            type: "object",
            additionalProperties: false,
            required: [
              "must_include",
              "correct_entities",
              "correct_step_order",
              "common_hallucinations",
              "out_of_scope",
            ],
            properties: {
              must_include: strArr,
              correct_entities: {
                type: "object",
                additionalProperties: false,
                required: ["functions", "imports_or_packages", "params_or_config", "identifiers"],
                properties: {
                  functions: strArr,
                  imports_or_packages: strArr,
                  params_or_config: strArr,
                  identifiers: strArr,
                },
              },
              correct_step_order: strArr,
              common_hallucinations: strArr,
              out_of_scope: strArr,
            },
          },
        },
      },
    },
  },
};

/**
 * Generate a probe set for a docs page. Returns the probes object, augmented
 * with `source_content` (the extracted markdown) so `probe` runs grade against
 * the exact content the answer key was derived from.
 */
export async function genProbes({ url, n, model, effort, fallback = true, tally }) {
  const page = await extractPage(url);

  // gen-probes works from the rendered main content only (no head/JSON-LD).
  const userContent = [
    `URL: ${page.finalUrl ?? url}`,
    `N: ${n}`,
    ``,
    `Page content:`,
    ``,
    page.markdown,
  ].join("\n");

  const probes = await runClaude({
    promptFile: "gen-probes.md",
    userContent,
    model,
    effort,
    fallback,
    jsonSchema: PROBES_SCHEMA,
    tally,
    tallyLabel: "gen-probes",
  });

  // Ground-truth snapshot for the grader — same bytes the answer key came from.
  probes.source_content = page.markdown;
  return { probes, page };
}

/** Filesystem-safe slug from a URL, e.g. "data-feeds" or "data-streams-go-sdk". */
export function slugFromUrl(url) {
  const u = new URL(url);
  const slug =
    u.pathname.replace(/\/+$/, "").split("/").filter(Boolean).slice(-2).join("-") || u.hostname;
  return slug.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").toLowerCase();
}
