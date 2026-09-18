// Small-sample statistics for the correlation study.
//
// Written before any outcome was observed. Every function here is covered by a
// known-answer test in stats.test.mjs — a silent bug in the rank transform would
// change the study's conclusion without changing anything visible.
//
// Choices that matter at n≈10:
//   - permutation p-values, not the t approximation, which is unreliable this small
//   - percentile bootstrap CIs, reported as approximate (BCa is not worth the
//     complexity when the honest headline is "this interval is very wide")

/** Average ranks, ties shared. [1,2,2,3] -> [1,2.5,2.5,4] */
export function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1; // 1-based, averaged over the tied block
    for (let k = i; k <= j; k++) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null; // no variance -> undefined, not zero
  return sxy / Math.sqrt(sxx * syy);
}

export const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));

/** OLS slope of y on x. Unbiased under selection on x, unlike r. */
export function olsSlope(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxx === 0 ? null : sxy / sxx;
}

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two-sided permutation p-value: how often does shuffling y against x produce a
 * statistic at least as extreme as the observed one? Makes no distributional
 * assumption, which is the point at this sample size.
 */
export function permutationP(xs, ys, stat = spearman, { iterations = 100_000, seed = 7 } = {}) {
  const observed = stat(xs, ys);
  if (observed === null) return null;
  const rand = rng(seed);
  const y = [...ys];
  let atLeastAsExtreme = 0;
  for (let it = 0; it < iterations; it++) {
    for (let i = y.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [y[i], y[j]] = [y[j], y[i]];
    }
    const s = stat(xs, y);
    if (s !== null && Math.abs(s) >= Math.abs(observed) - 1e-12) atLeastAsExtreme++;
  }
  // +1/+1 keeps p strictly positive — a p of exactly 0 is not a thing a
  // finite permutation sample can establish.
  return (atLeastAsExtreme + 1) / (iterations + 1);
}

/** Percentile bootstrap CI over paired resampling of units. Approximate at small n. */
export function bootstrapCI(xs, ys, stat = spearman, { iterations = 10_000, alpha = 0.05, seed = 11 } = {}) {
  const rand = rng(seed);
  const n = xs.length;
  const vals = [];
  for (let it = 0; it < iterations; it++) {
    const bx = [], by = [];
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rand() * n);
      bx.push(xs[k]); by.push(ys[k]);
    }
    const s = stat(bx, by);
    if (s !== null && Number.isFinite(s)) vals.push(s);
  }
  if (vals.length < 100) return null;
  vals.sort((a, b) => a - b);
  const lo = vals[Math.floor((alpha / 2) * vals.length)];
  const hi = vals[Math.min(vals.length - 1, Math.floor((1 - alpha / 2) * vals.length))];
  return { lo, hi, resamples: vals.length };
}

/** Wilcoxon signed-rank against 0, via permutation of signs. For paired lift. */
export function signedRankP(diffs, { iterations = 100_000, seed = 13 } = {}) {
  const nz = diffs.filter((d) => d !== 0);
  if (!nz.length) return null;
  const stat = (ds) => {
    const r = ranks(ds.map(Math.abs));
    return ds.reduce((a, d, i) => a + Math.sign(d) * r[i], 0);
  };
  const observed = stat(nz);
  const rand = rng(seed);
  let extreme = 0;
  for (let it = 0; it < iterations; it++) {
    const flipped = nz.map((d) => (rand() < 0.5 ? -d : d));
    if (Math.abs(stat(flipped)) >= Math.abs(observed) - 1e-12) extreme++;
  }
  return { statistic: observed, p: (extreme + 1) / (iterations + 1) };
}

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const sd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Smallest |r| a two-sided permutation test would call significant at this n.
 * Reported alongside a null so "we found nothing" is quantified rather than asserted.
 */
export function detectableR(n, { alpha = 0.05, seed = 17 } = {}) {
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const rand = rng(seed);
  const nulls = [];
  for (let it = 0; it < 20_000; it++) {
    const y = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [y[i], y[j]] = [y[j], y[i]];
    }
    nulls.push(Math.abs(spearman(xs, y)));
  }
  nulls.sort((a, b) => a - b);
  return nulls[Math.floor((1 - alpha) * nulls.length)];
}
