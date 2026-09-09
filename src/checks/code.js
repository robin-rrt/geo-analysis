// Code checks — how runnable a snippet is for an agent that copy-pastes it.
//
// These are heuristics over a handful of languages, not a compiler. Read the
// counts as a signal, not a verdict; the Limitations section in the plan spells
// out what they miss.

import { scanFences } from "./structure.js";

/** Extract fenced blocks with their bodies. */
function fenceBodies(markdown) {
  const lines = markdown.split("\n");
  const out = [];
  let open = null;

  lines.forEach((line, i) => {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/);
    if (!m) return;
    const [, marker, info] = m;
    const char = marker[0];
    if (!open) {
      open = { char, length: marker.length, lang: info.trim().split(/\s+/)[0]?.toLowerCase() ?? "", start: i };
    } else if (char === open.char && marker.length >= open.length && info.trim() === "") {
      out.push({ lang: open.lang, body: lines.slice(open.start + 1, i).join("\n") });
      open = null;
    }
  });
  if (open) out.push({ lang: open.lang, body: lines.slice(open.start + 1).join("\n") });
  return out;
}

const IMPORT_PATTERNS = [
  /^\s*import\s/m,          // JS/TS/Go/Python
  /^\s*from\s+\S+\s+import/m, // Python
  /^\s*(?:const|let|var)\s+\{?[\w\s,]+\}?\s*=\s*require\(/m, // CJS
  /^\s*#include\s/m,        // C/C++
  /^\s*use\s+\w/m,          // Rust
  /^\s*pragma\s+solidity/m, // Solidity
];

const DOMAIN_ACRONYMS = /^(HTTP|HTTPS|JSON|URL|URI|API|UTF|ABI|EVM|SDK|CRE|VRF|LINK|DON|TODO|NOTE|FIXME|XML|HTML|CSV|UUID|CLI|RPC|REST|GRPC)$/;

// Language builtins that are defined by the runtime, not by the snippet.
const BUILTIN_CONSTANTS = new Set([
  "MAX_SAFE_INTEGER", "MIN_SAFE_INTEGER", "MAX_VALUE", "MIN_VALUE",
  "POSITIVE_INFINITY", "NEGATIVE_INFINITY", "EPSILON", "NEGATIVE",
  "MAX_UINT256", "MAX_INT256", "STDOUT", "STDERR", "STDIN",
]);

// Languages where a missing import is meaningful. Shell/JSON/YAML have none.
const NEEDS_IMPORTS = new Set([
  "ts", "tsx", "typescript", "js", "jsx", "javascript", "go", "golang",
  "python", "py", "rust", "rs", "solidity", "sol", "java",
]);

export function checkCode({ markdown = "" }) {
  const fences = scanFences(markdown);
  const bodies = fenceBodies(markdown);

  const substantive = bodies.filter((b) => b.body.trim().split("\n").length >= 3);
  const importable = substantive.filter((b) => NEEDS_IMPORTS.has(b.lang));
  const withImports = importable.filter((b) => IMPORT_PATTERNS.some((re) => re.test(b.body)));

  // Placeholder comments stand in for values an agent needs but isn't given.
  const placeholderBlocks = bodies.filter((b) =>
    /(\/\*|\/\/|#)\s*(your|replace|todo|placeholder|base64-encoded|insert|add your|<[A-Z_]{3,}>)/i.test(b.body),
  ).length;

  // ALL_CAPS identifiers used but never assigned — the CHAIN_SELECTOR class of gap.
  const undefinedConstants = new Set();
  for (const b of importable) {
    const assigned = new Set(
      [...b.body.matchAll(/(?:const|let|var|=)\s*([A-Z][A-Z0-9_]{2,})\s*[=:]/g)].map((m) => m[1]),
    );
    for (const [, id] of b.body.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)) {
      // Skip domain acronyms and language builtins — Number.MAX_SAFE_INTEGER is
      // not a missing definition, and flagging it teaches the auditor to distrust
      // the whole list.
      if (assigned.has(id) || DOMAIN_ACRONYMS.test(id) || BUILTIN_CONSTANTS.has(id)) continue;
      undefinedConstants.add(id);
    }
  }

  return {
    codeBlocks: fences.total,
    substantiveBlocks: substantive.length,
    untaggedBlocks: fences.untagged,
    unclosedFences: fences.unclosed,
    languages: [...new Set(fences.languages)],
    blocksNeedingImports: importable.length,
    blocksWithImports: withImports.length,
    blocksMissingImports: importable.length - withImports.length,
    placeholderBlocks,
    undefinedConstants: [...undefinedConstants].slice(0, 12),
  };
}
