// Link checks — attribution surface.
//
// Counts only, no reachability testing: fetching every link would turn a free
// check into a slow one, and link integrity belongs at corpus scale where the
// crawl already has every page in hand.

// Domains that count as primary sources for the kind of claims docs make.
const PRIMARY_SOURCE_HOSTS = [
  "ietf.org", "rfc-editor.org", "w3.org", "iso.org", "nist.gov",
  "github.com", "eips.ethereum.org", "ethereum.org", "arxiv.org",
  "developer.mozilla.org", "go.dev", "pkg.go.dev", "docs.soliditylang.org",
  "typescriptlang.org", "python.org", "rust-lang.org",
];

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export function checkLinks({ markdown = "", finalUrl = null }) {
  const selfHost = finalUrl ? hostOf(finalUrl) : null;

  // Inline markdown links only — reference-style links are rare in generated docs.
  const links = [...markdown.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => ({
    text: m[1].trim(),
    href: m[2].trim(),
  }));

  const external = [];
  const internal = [];
  for (const l of links) {
    if (/^https?:\/\//i.test(l.href)) {
      const h = hostOf(l.href);
      // Absolute links back to the same host are internal in every sense that matters.
      (h && selfHost && h === selfHost ? internal : external).push({ ...l, host: h });
    } else if (/^(mailto|tel):/i.test(l.href)) {
      continue;
    } else {
      internal.push({ ...l, host: selfHost });
    }
  }

  const primary = external.filter((l) => PRIMARY_SOURCE_HOSTS.some((h) => l.host?.endsWith(h)));

  // Link text that says nothing is useless to an agent choosing where to go.
  const opaque = links.filter((l) => /^(here|this|link|click here|read more|docs?)$/i.test(l.text));

  return {
    totalLinks: links.length,
    internalLinks: internal.length,
    externalLinks: external.length,
    primarySourceLinks: primary.length,
    primarySourceHosts: [...new Set(primary.map((l) => l.host))],
    externalHosts: [...new Set(external.map((l) => l.host).filter(Boolean))],
    opaqueLinkTexts: opaque.length,
  };
}
