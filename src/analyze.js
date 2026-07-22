import { runClaude } from "./claude.js";

// Models occasionally wrap the whole report in a ```markdown fence despite
// instructions (imitating the prompt's output template). The report is saved
// as .md, so unwrap it — greedy middle match preserves any internal fences.
export function stripReportFence(text) {
  const m = text.match(/^\s*```(?:markdown|md)?[ \t]*\n([\s\S]*)\n[ \t]*```[ \t]*\n?$/);
  return m ? `${m[1]}\n` : text;
}

/**
 * Run the GEO score audit. Streams report text via onText and returns the
 * full markdown report. When probeResults (JSON string of a probe run) is
 * provided, the auditor applies the probe-informed diagnosis: score↔fidelity
 * reframe, hit/miss split, miss triage, parametric overrides, and tiered recs.
 */
export async function runAudit({
  url,
  pageContent,
  probeResults,
  model,
  effort,
  fallback = true,
  onText,
}) {
  const parts = [
    `URL: ${url}`,
    ``,
    `Analyzed at (use as the report's ISO timestamp): ${new Date().toISOString()}`,
    ``,
  ];
  if (probeResults) {
    parts.push(
      `Probe results (fidelity run for this page — apply the probe-informed diagnosis):`,
      ``,
      probeResults,
      ``,
    );
  }
  parts.push(`Page content:`, ``, pageContent);
  const userContent = parts.join("\n");

  const report = await runClaude({
    promptFile: "geo-audit.md",
    userContent,
    model,
    effort,
    fallback,
    onText,
  });
  return stripReportFence(report);
}
