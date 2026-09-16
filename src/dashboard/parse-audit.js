// Parses the audit report template mandated by prompts/geo-audit.md.
//
// The reports are prose Markdown, but the prompt pins the exact structure
// ("return exactly this Markdown, nothing else"), so a line parser is reliable.
// Every parse asserts the invariants that matter — 9 dimensions, weights summing
// to 100 — and throws rather than returning a half-read report, because a
// silently mis-parsed audit would render as a confident wrong number.

const DIMENSION_COUNT = 9;
const TOTAL_WEIGHT = 100;

class AuditParseError extends Error {
  constructor(message, file) {
    super(file ? `${file}: ${message}` : message);
    this.name = "AuditParseError";
    this.file = file;
  }
}

/**
 * Text between `## heading` and the next `## ` (or EOF). Null when absent.
 *
 * Scans lines rather than using a lookahead: JavaScript has no `\z` anchor, and
 * a `(?=^## |\z)` lookahead silently truncates each section at the first literal
 * "z" in the prose.
 */
function section(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

/** Top-level `- ` bullets of a block, with wrapped continuation lines joined. */
function bullets(block) {
  if (!block) return [];
  const out = [];
  for (const line of block.split("\n")) {
    const top = line.match(/^- (.*)$/);
    if (top) {
      out.push(top[1].trim());
    } else if (out.length && line.trim()) {
      out[out.length - 1] += ` ${line.trim()}`;
    }
  }
  return out;
}

/** Strip Markdown emphasis and inline code for plain-text comparison. */
function plain(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

function parseHeader(markdown, file) {
  const title = markdown.match(/^# GEO Audit — (.+)$/m);
  if (!title) throw new AuditParseError("missing `# GEO Audit — ...` title", file);

  const field = (name) => {
    const m = markdown.match(new RegExp(`^\\*\\*${name}:\\*\\* (.+)$`, "m"));
    return m ? m[1].trim() : null;
  };

  return {
    title: title[1].trim(),
    url: field("URL"),
    analyzedAt: field("Analyzed"),
    contentType: field("Content type"),
  };
}

function parseScore(markdown, file) {
  // The model usually writes an integer but sometimes carries the weighted
  // total through as a decimal ("71.1/100"), so accept both rather than
  // failing the whole report over the formatting of one line.
  const m = markdown.match(/^## GEO Score: (\d+(?:\.\d+)?)\/100 — (.+)$/m);
  if (!m) throw new AuditParseError("missing `## GEO Score: n/100 — Band` line", file);
  return { score: Number(m[1]), band: m[2].trim() };
}

/** Split a Markdown table row into trimmed cells. Cells may be empty. */
function cells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed.slice(1, -1).split("|").map((c) => c.trim());
}

// The dimension table: 9 scored rows plus a bolded total row whose score cell is
// empty (`| **Total** | **100** | | **74.7** |`), so rows are split, not matched.
function parseDimensions(markdown, file) {
  const rows = markdown
    .split("\n")
    .map(cells)
    .filter((row) => row && row.length === 4)
    .filter(([name]) => name !== "Dimension" && !/^[-:]+$/.test(name));

  const dimensions = [];
  let weightedTotal = null;

  for (const [name, weight, score, weighted] of rows) {
    if (plain(name) === "Total") {
      const value = Number(plain(weighted));
      if (Number.isFinite(value)) weightedTotal = value;
      continue;
    }
    const w = Number(weight);
    const s = Number(score);
    // Non-numeric rows belong to another table (e.g. the probe retrieval table).
    if (!Number.isFinite(w) || !Number.isFinite(s)) continue;
    dimensions.push({ name, weight: w, score: s, weighted: Number(weighted) });
  }

  if (dimensions.length !== DIMENSION_COUNT) {
    throw new AuditParseError(
      `expected ${DIMENSION_COUNT} dimension rows, found ${dimensions.length}`,
      file,
    );
  }
  const sum = dimensions.reduce((acc, d) => acc + d.weight, 0);
  if (sum !== TOTAL_WEIGHT) {
    throw new AuditParseError(`dimension weights sum to ${sum}, expected ${TOTAL_WEIGHT}`, file);
  }
  if (weightedTotal === null) {
    throw new AuditParseError("missing `| **Total** |` row", file);
  }

  return { dimensions, weightedTotal };
}

// Dimension-analysis bullets appear in two shapes across existing reports:
//   - **Name:** text        (reference-vrf-migration-ts)
//   - **Name** — text       (concepts-non-determinism-go)
// Names are also abbreviated relative to the table ("Code completeness" vs
// "Code completeness & agent-runnability"), so they are matched loosely.
function parseDimensionAnalysis(markdown) {
  return bullets(section(markdown, "Dimension analysis")).map((line) => {
    const m = line.match(/^\*\*(.+?):?\*\*\s*(?:—|-|:)?\s*(.*)$/);
    return m
      ? { dimension: m[1].replace(/:$/, "").trim(), text: m[2].trim() }
      : { dimension: null, text: line };
  });
}

/** Loosely associate an analysis bullet with a table dimension. */
export function matchDimension(analysisName, dimensionNames) {
  if (!analysisName) return null;
  const norm = (s) => plain(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = norm(analysisName);
  let best = null;
  for (const name of dimensionNames) {
    const candidate = norm(name);
    if (candidate === target) return name;
    // Prefix match handles the abbreviated forms; longest wins.
    if (candidate.startsWith(target) || target.startsWith(candidate)) {
      if (!best || name.length > best.length) best = name;
    }
  }
  if (best) return best;
  // Fall back to first-significant-word overlap ("Clarity & terminology").
  const [firstWord] = target.split(" ");
  return dimensionNames.find((n) => norm(n).startsWith(firstWord)) ?? null;
}

// Recommendations are 4-field blocks under an optional `### Tier N` heading:
//   - **[P1] Title** — *Maps to: ...*
//     - **Where:** ... / **Issue:** ... / **Change:** ... / **Why it lifts GEO:** ...
function parseRecommendations(markdown) {
  const block = section(markdown, "Prioritized recommendations");
  if (!block) return [];

  const out = [];
  let tier = null;
  let current = null;

  const flush = () => {
    if (current) out.push(current);
    current = null;
  };

  for (const line of block.split("\n")) {
    const tierHeading = line.match(/^### (.+)$/);
    if (tierHeading) {
      flush();
      tier = tierHeading[1].trim();
      continue;
    }

    const head = line.match(/^- \*\*\[P(\d)\]\s*(.+?)\*\*\s*(?:—\s*\*Maps to:\s*(.+?)\*)?\s*$/);
    if (head) {
      flush();
      current = {
        priority: Number(head[1]),
        title: head[2].trim(),
        mapsTo: head[3]?.trim() ?? null,
        tier,
        where: null,
        issue: null,
        change: null,
        why: null,
      };
      continue;
    }

    if (!current) continue;

    const field = line.match(/^\s+- \*\*(Where|Issue|Change|Why it lifts GEO):\*\*\s*(.*)$/);
    if (field) {
      const key = { Where: "where", Issue: "issue", Change: "change", "Why it lifts GEO": "why" }[
        field[1]
      ];
      current[key] = field[2].trim();
      current._last = key;
      continue;
    }
    // Continuation of the previous field (reports wrap long lines).
    if (current._last && line.trim()) current[current._last] += ` ${line.trim()}`;
  }
  flush();

  return out.map(({ _last, ...rec }) => rec);
}

// Only present when `score --probe-results` was used. Captured as prose plus the
// retrieval table; the authoritative per-probe numbers come from the probe JSON.
function parseProbeInformed(markdown) {
  const block = section(markdown, "Probe-informed diagnosis");
  if (!block) return null;

  const gap = block.match(/^\*\*GEO score vs probe fidelity:\*\*\s*(.+)$/m);
  const retrieval = {};
  for (const [, label, probes, fidelity] of block.matchAll(
    /^\|\s*(Hit expected source|Missed)\s*\|\s*(\d+)\s*\|\s*([\d.]+)\s*\|$/gm,
  )) {
    retrieval[label === "Missed" ? "missed" : "hit"] = {
      probes: Number(probes),
      avgFidelity: Number(fidelity),
    };
  }

  const labelled = (name) => {
    const m = block.match(new RegExp(`^- \\*\\*${name}:?\\*\\*\\s*([\\s\\S]*?)(?=^- \\*\\*|\\z)`, "m"));
    return m ? m[1].trim() : null;
  };

  return {
    summary: gap ? gap[1].trim() : null,
    retrieval: Object.keys(retrieval).length ? retrieval : null,
    missTriage: labelled("Miss triage"),
    parametricOverrides: labelled("Parametric overrides \\(hit source, wrong answer\\)"),
    confidentInversions: labelled("Confident inversions"),
    harnessArtifacts: labelled("Harness artifacts excluded from page blame"),
  };
}

/**
 * Parse one audit report into a structured object.
 * `file` is used only to make thrown errors identifiable.
 */
export function parseAudit(markdown, file) {
  if (typeof markdown !== "string" || !markdown.trim()) {
    throw new AuditParseError("empty report", file);
  }

  const header = parseHeader(markdown, file);
  const { score, band } = parseScore(markdown, file);
  const { dimensions, weightedTotal } = parseDimensions(markdown, file);

  const analysis = parseDimensionAnalysis(markdown);
  const names = dimensions.map((d) => d.name);

  return {
    ...header,
    score,
    band,
    weightedTotal,
    dimensions: dimensions.map((d) => ({
      ...d,
      // Attach the prose critique to its table row where they can be matched.
      analysis: analysis.find((a) => matchDimension(a.dimension, names) === d.name)?.text ?? null,
    })),
    summary: section(markdown, "Summary"),
    probeInformed: parseProbeInformed(markdown),
    recommendations: parseRecommendations(markdown),
    antiPatterns: bullets(section(markdown, "Anti-patterns found")),
    offPageNotes: bullets(section(markdown, "Off-page / out-of-scope notes")),
  };
}

export { AuditParseError };
