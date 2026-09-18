// Deterministic candidate selection for the correlation study.
//
// Two sampling rules, both chosen before any outcome was observed:
//
//   1. At most 2 pages per section. Pages inside one product share a template,
//      so their structural scores are not independent draws — loading the sample
//      with one product would measure that product's house style.
//   2. Seeded shuffle, so the candidate list is reproducible from this file
//      rather than from whatever the corpus happened to return that day.
//
// Selection here is on the PREDICTOR side only (which pages to audit). No
// fidelity has been measured at this point, so this cannot bias the outcome.

import fs from "node:fs";

const MAX_PER_SECTION = 2;
const TARGET = 18;
const SEED = 20260918;

// mulberry32 — a small deterministic PRNG; Math.random() would make the
// candidate list unreproducible.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(xs, rand) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sectionOf = (url) => url.replace("https://docs.chain.link/", "").split("/")[0];

export const slugOf = (url) =>
  url.replace("https://docs.chain.link/", "").replace(/\//g, "-") || "root";

export function select(urls, { target = TARGET, maxPerSection = MAX_PER_SECTION, seed = SEED } = {}) {
  const rand = rng(seed);
  // Shuffle within each section, then round-robin across sections. This spreads
  // the sample over products instead of taking whatever sorts first.
  const bySection = new Map();
  for (const u of shuffle(urls, rand)) {
    const s = sectionOf(u);
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s).push(u);
  }
  const sections = shuffle([...bySection.keys()], rand);
  const picked = [];
  for (let round = 0; round < maxPerSection && picked.length < target; round++) {
    for (const s of sections) {
      if (picked.length >= target) break;
      const u = bySection.get(s)[round];
      if (u) picked.push(u);
    }
  }
  return picked;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const urls = fs.readFileSync(process.argv[2], "utf8").trim().split("\n").filter(Boolean);
  const picked = select(urls);
  for (const u of picked) console.log(u);
  console.error(`selected ${picked.length} of ${urls.length} candidates`);
  const counts = {};
  for (const u of picked) counts[sectionOf(u)] = (counts[sectionOf(u)] ?? 0) + 1;
  console.error("per section:", JSON.stringify(counts));
}
