// Structure checks — heading tree, code fences, and chunk shape.
//
// Fence scanning follows the CommonMark rule the teammate's crawler documents:
// a closing fence must use the same character, be at least as long as the
// opener, and carry no info string. That keeps a shorter fence nested inside a
// longer one from closing the block early.

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/;

/** Scan fenced code blocks: closure, language tagging, and line spans. */
export function scanFences(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  let open = null;

  lines.forEach((line, i) => {
    const m = line.match(FENCE);
    if (!m) return;
    const [, marker, info] = m;
    const char = marker[0];

    if (!open) {
      open = { char, length: marker.length, info: info.trim(), startLine: i + 1 };
      return;
    }
    // Close only on the same char, at least as long, with no info string.
    if (char === open.char && marker.length >= open.length && info.trim() === "") {
      blocks.push({ ...open, endLine: i + 1, closed: true });
      open = null;
    }
  });

  if (open) blocks.push({ ...open, endLine: null, closed: false });

  return {
    total: blocks.length,
    unclosed: blocks.filter((b) => !b.closed).map((b) => b.startLine),
    untagged: blocks.filter((b) => b.info === "").length,
    languages: blocks.filter((b) => b.info).map((b) => b.info.split(/\s+/)[0].toLowerCase()),
  };
}

/** ATX headings, ignoring anything inside a fenced block so shell comments don't register. */
export function headings(markdown) {
  const lines = markdown.split("\n");
  const found = [];
  let open = null;

  lines.forEach((line, i) => {
    const fence = line.match(FENCE);
    if (fence) {
      const [, marker, info] = fence;
      const char = marker[0];
      if (!open) open = { char, length: marker.length };
      else if (char === open.char && marker.length >= open.length && info.trim() === "") open = null;
      return;
    }
    if (open) return; // inside a code block

    const h = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) found.push({ level: h[1].length, text: h[2].trim(), line: i + 1 });
  });

  return found;
}

export function checkStructure({ markdown = "" }) {
  const hs = headings(markdown);
  const fences = scanFences(markdown);

  const h1s = hs.filter((h) => h.level === 1);
  const levelSkips = [];
  for (let i = 1; i < hs.length; i++) {
    if (hs[i].level > hs[i - 1].level + 1) {
      levelSkips.push({ from: hs[i - 1].level, to: hs[i].level, line: hs[i].line });
    }
  }

  // Section lengths between headings approximate RAG chunk sizes.
  const words = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);
  const lines = markdown.split("\n");
  const sectionWordCounts = hs.map((h, i) => {
    const end = i + 1 < hs.length ? hs[i + 1].line - 1 : lines.length;
    return words(lines.slice(h.line, end).join(" "));
  });

  return {
    headingCount: hs.length,
    h1Count: h1s.length,
    headingLevelSkips: levelSkips,
    maxHeadingDepth: hs.length ? Math.max(...hs.map((h) => h.level)) : 0,
    sectionCount: sectionWordCounts.length,
    medianSectionWords: median(sectionWordCounts),
    maxSectionWords: sectionWordCounts.length ? Math.max(...sectionWordCounts) : 0,
    // A section far longer than its siblings is a poor retrieval unit.
    oversizedSections: sectionWordCounts.filter((w) => w > 600).length,
    tableCount: (markdown.match(/^\s*\|.+\|\s*$/gm) ?? []).length ? countTables(markdown) : 0,
    bulletCount: (markdown.match(/^\s*[-*+]\s+/gm) ?? []).length,
    wordCount: words(markdown),
    codeFences: fences.total,
    unclosedFences: fences.unclosed,
    untaggedFences: fences.untagged,
  };
}

function countTables(markdown) {
  // A table is a header row followed by a delimiter row.
  return (markdown.match(/^\s*\|.+\|\s*\n\s*\|[\s:|-]+\|\s*$/gm) ?? []).length;
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
