// Renders the collected dataset to a single self-contained HTML document.
// Everything is emitted server-side; the inlined script only toggles visibility
// and sorts rows, so the page is fully readable with JavaScript disabled apart
// from tab switching.

import { CSS, JS } from "./theme.js";

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Escape first, then re-introduce the small subset of inline Markdown used in reports. */
function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>');
}

const DASH = '<span class="faint">—</span>';
const pct = (rate) => (Number.isFinite(rate) ? `${Math.round(rate * 100)}%` : null);
const bandClass = (band) => `band-${String(band ?? "").toLowerCase().replace(/[^a-z]/g, "")}`;

/** A value that may legitimately be unknown. Never renders a placeholder zero. */
const show = (value, format = (v) => v) => (value === null || value === undefined ? DASH : format(value));

function bar(value, max, className = "") {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return `<div class="bar"><i class="${className}" style="width:${width.toFixed(1)}%"></i></div>`;
}

function kpi(label, value, note) {
  return `<div class="kpi">
    <div class="label">${esc(label)}</div>
    <div class="value">${value}</div>
    ${note ? `<div class="note">${esc(note)}</div>` : ""}
  </div>`;
}

function table({ head, rows, className = "" }) {
  return `<div class="tablewrap"><table class="${className}">
    <thead><tr>${head
      .map(
        (h) =>
          `<th${h.num ? ' class="num"' : ""}${h.sort === false ? "" : ' data-sort="1"'}>${esc(h.label)}</th>`,
      )
      .join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table></div>`;
}

const cell = (content, { num = false, sortValue } = {}) =>
  `<td${num ? ' class="num"' : ""}${sortValue === undefined ? "" : ` data-v="${esc(sortValue)}"`}>${content}</td>`;

// ------------------------------------------------------------------ overview --

function renderOverview({ pages, aggregates: agg }) {
  const gapRows = pages
    .filter((p) => p.primaryRun)
    .map((p) => {
      const score = p.audit.score;
      const fidelity = p.primaryRun.avgFidelity;
      return { page: p, score, fidelity, gap: score - fidelity };
    })
    .sort((a, b) => b.gap - a.gap);

  const gapChart = gapRows.length
    ? `<div class="gap">${gapRows
        .map(
          ({ page, score, fidelity, gap }) => `<div class="row">
        <div class="name"><a href="#" data-goto="detail-${esc(page.slug)}">${esc(page.title)}</a>
          <div class="faint small">gap ${gap > 0 ? "+" : ""}${gap.toFixed(1)}</div></div>
        <div class="pair">
          <div class="metric"><span class="k">GEO score</span>${bar(score, 100, "score")}<span class="v">${score}</span></div>
          <div class="metric"><span class="k">Fidelity</span>${bar(fidelity, 100, "fid")}<span class="v">${fidelity}</span></div>
        </div>
      </div>`,
        )
        .join("")}</div>`
    : `<p class="muted">No probe runs yet — run <code>geo-audit probe</code> to compare score against answer fidelity.</p>`;

  const corpusRows = pages.map((p) => {
    const run = p.primaryRun;
    const p1 = p.audit.recommendations.filter((r) => r.priority === 1).length;
    return `<tr>
      ${cell(
        `<a href="#" data-goto="detail-${esc(p.slug)}">${esc(p.title)}</a>
         <div class="faint small mono">${esc(p.slug)}</div>`,
        { sortValue: p.title },
      )}
      ${cell(`<span class="band ${bandClass(p.audit.band)}">${p.audit.score}</span>`, { num: true, sortValue: p.audit.score })}
      ${cell(`<span class="${bandClass(p.audit.band)}">${esc(p.audit.band)}</span>`, { sortValue: p.audit.score })}
      ${cell(show(run?.avgFidelity ?? null), { num: true, sortValue: run?.avgFidelity ?? "" })}
      ${cell(show(run ? pct(run.hitRate) : null), { num: true, sortValue: run?.hitRate ?? "" })}
      ${cell(String(p1), { num: true, sortValue: p1 })}
      ${cell(run ? `${run.probeCount} probes` : `<span class="faint">not probed</span>`, { sortValue: run?.probeCount ?? 0 })}
    </tr>`;
  });

  const { hit, miss, delta } = agg.fidelityByRetrieval;

  return `<section class="view" id="view-overview">
    <div class="kpis">
      ${kpi("Pages audited", agg.pageCount, `${agg.probedPageCount} with probe runs`)}
      ${kpi("Median GEO score", show(agg.medianScore), `mean ${show(agg.meanScore)}`)}
      ${kpi("Median fidelity", show(agg.medianFidelity), agg.probedPageCount ? `across ${agg.probedPageCount} probed pages` : "no probe runs")}
      ${kpi("Retrieval hit rate", show(pct(agg.hitRate)), `n=${agg.probeCount} probes`)}
    </div>

    ${
      hit.n && miss.n
        ? `<div class="note"><strong>A retrieval hit is worth ${delta} fidelity points.</strong>
       Answers that cited the source page averaged ${hit.avgFidelity} fidelity (n=${hit.n});
       answers that did not averaged ${miss.avgFidelity} (n=${miss.n}). Retrieval, not prose quality,
       is the dominant lever across this corpus.</div>`
        : ""
    }

    <h2>Score vs answer fidelity</h2>
    <p class="muted small">How good the page looks to the rubric, against how accurately models actually answer from it.
    A large gap means the content is fine but is not being retrieved or is being overridden by the model's priors.</p>
    ${gapChart}

    <h2>All pages</h2>
    ${table({
      head: [
        { label: "Page" },
        { label: "Score", num: true },
        { label: "Band" },
        { label: "Fidelity", num: true },
        { label: "Hit rate", num: true },
        { label: "P1s", num: true },
        { label: "Probes" },
      ],
      rows: corpusRows,
    })}

    <h2>Weakest dimensions across the corpus</h2>
    <p class="muted small">Mean score per rubric dimension over all ${agg.pageCount} pages — systemic weaknesses, not per-page ones.</p>
    <div class="dimgrid">
      ${agg.dimensionMeans
        .map(
          (d) => `<div class="dim">
        <div>${esc(d.name)}</div>
        <div class="wt">weight ${d.weight} · n=${d.n}</div>
        <div class="barrow">${bar(d.mean, 10)}<span class="mono small">${d.mean.toFixed(1)}/10</span></div>
      </div>`,
        )
        .join("")}
    </div>
  </section>`;
}

// --------------------------------------------------------------- page detail --

function renderScorecard(page) {
  const a = page.audit;
  return `<div class="tabpanel" id="tab-${esc(page.slug)}-score">
    <div class="kpis">
      ${kpi("GEO score", `<span class="${bandClass(a.band)}">${a.score}</span>`, a.band)}
      ${kpi("Weighted total", a.weightedTotal, "sum of dimension scores")}
      ${kpi("Fidelity", show(page.primaryRun?.avgFidelity ?? null), page.primaryRun ? `${page.primaryRun.probeCount} probes` : "not probed")}
      ${kpi("Hit rate", show(page.primaryRun ? pct(page.primaryRun.hitRate) : null), "source cited")}
    </div>
    ${
      page.rescored?.from
        ? `<div class="note">Re-scored with probe evidence: <strong>${page.rescored.from} → ${page.rescored.to}</strong>.
           Both runs are kept; see Methodology on run-to-run variance.</div>`
        : ""
    }
    <h3>Summary</h3>
    <p>${inline(a.summary)}</p>
    ${
      a.probeInformed
        ? `<h3>Probe-informed diagnosis</h3>
           <p>${inline(a.probeInformed.summary)}</p>
           ${a.probeInformed.missTriage ? `<div class="note">${inline(a.probeInformed.missTriage)}</div>` : ""}`
        : ""
    }
    <h3>Dimensions</h3>
    <div class="dimgrid">
      ${a.dimensions
        .map(
          (d) => `<div class="dim">
        <div>${esc(d.name)}<div class="wt">weight ${d.weight} · contributes ${d.weighted}</div></div>
        <div class="barrow">${bar(d.score, 10)}<span class="mono small">${d.score}/10</span></div>
        <div class="muted small">${d.analysis ? inline(d.analysis) : DASH}</div>
      </div>`,
        )
        .join("")}
    </div>
  </div>`;
}

function renderRecommendations(page) {
  const recs = page.audit.recommendations;
  const groups = new Map();
  for (const rec of recs) {
    const key = rec.tier ?? `P${rec.priority}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }

  return `<div class="tabpanel" id="tab-${esc(page.slug)}-recs" hidden>
    <p class="muted small">${recs.length} recommendations, ranked by expected lift × ease.</p>
    ${[...groups.entries()]
      .map(
        ([group, items]) => `<h3>${esc(group)}</h3>
      ${items
        .map(
          (rec) => `<div class="card">
        <h4><span class="pill p${rec.priority}">P${rec.priority}</span> ${inline(rec.title)}
          ${rec.mapsTo ? `<span class="faint small">${esc(rec.mapsTo)}</span>` : ""}</h4>
        <dl>
          ${rec.where ? `<dt>Where</dt><dd>${inline(rec.where)}</dd>` : ""}
          ${rec.issue ? `<dt>Issue</dt><dd>${inline(rec.issue)}</dd>` : ""}
          ${rec.change ? `<dt>Change</dt><dd>${inline(rec.change)}</dd>` : ""}
          ${rec.why ? `<dt>Why</dt><dd class="muted">${inline(rec.why)}</dd>` : ""}
        </dl>
      </div>`,
        )
        .join("")}`,
      )
      .join("")}
  </div>`;
}

function renderProbes(page) {
  const run = page.primaryRun;
  if (!run) {
    return `<div class="tabpanel" id="tab-${esc(page.slug)}-probes" hidden>
      <p class="muted">No probe run for this page. Generate probes and run them:</p>
      <p><code>geo-audit gen-probes ${esc(page.url)}</code><br>
         <code>geo-audit probe results/${esc(page.slug)}/probes.json</code></p>
    </div>`;
  }

  const rows = run.probes.map((p) => {
    const high = p.hallucinations.filter((h) => h.severity === "high").length;
    return `<tr>
      ${cell(`<span class="mono">${esc(p.id)}</span>`, { sortValue: p.id })}
      ${cell(`<span class="pill">${esc(p.archetype)}</span>`, { sortValue: p.archetype })}
      ${cell(`${p.fidelity}`, { num: true, sortValue: p.fidelity })}
      ${cell(
        p.hit ? '<span class="pill hit">cited</span>' : '<span class="pill miss">missed</span>',
        { sortValue: p.hit ? 1 : 0 },
      )}
      ${cell(
        p.hallucinations.length
          ? `${p.hallucinations.length}${high ? ` <span class="sev-high small">(${high} high)</span>` : ""}`
          : DASH,
        { num: true, sortValue: p.hallucinations.length },
      )}
      ${cell(`<div class="small">${inline(p.prompt)}</div>`, { sortValue: p.prompt })}
    </tr>`;
  });

  const detailCards = run.probes
    .map(
      (p) => `<div class="card">
    <h4><span class="mono">${esc(p.id)}</span> <span class="pill">${esc(p.archetype)}</span>
      <span class="${p.fidelity >= 70 ? "band-strong" : p.fidelity >= 50 ? "band-developing" : "band-poor"}">${p.fidelity}/100</span>
      ${p.hit ? '<span class="pill hit">cited source</span>' : '<span class="pill miss">missed source</span>'}</h4>
    <dl>
      <dt>Prompt</dt><dd>${inline(p.prompt)}</dd>
      <dt>Verdict</dt><dd class="muted">${inline(p.verdict)}</dd>
      ${
        p.hallucinations.length
          ? `<dt>Hallucinations</dt><dd><ul class="tight">${p.hallucinations
              .map(
                (h) =>
                  `<li><span class="sev-${esc(h.severity)}">${esc(h.severity)}</span>
                   <span class="faint">${esc(h.type)}</span> — ${inline(h.claim)}</li>`,
              )
              .join("")}</ul></dd>`
          : ""
      }
      ${
        p.missingMustInclude.length
          ? `<dt>Missing</dt><dd><ul class="tight">${p.missingMustInclude.map((m) => `<li>${inline(m)}</li>`).join("")}</ul></dd>`
          : ""
      }
      ${
        p.harness.searchDegraded || p.harness.liveSearchFailed
          ? `<dt>Harness</dt><dd class="sev-med">Search degraded — this miss is inconclusive.</dd>`
          : ""
      }
    </dl>
    <details><summary>Full model answer (${p.answer.length.toLocaleString()} chars)</summary><pre>${esc(p.answer)}</pre></details>
  </div>`,
    )
    .join("");

  return `<div class="tabpanel" id="tab-${esc(page.slug)}-probes" hidden>
    <div class="kpis">
      ${kpi("Avg fidelity", run.avgFidelity, `${run.probeCount} probes`)}
      ${kpi("Hit rate", show(pct(run.hitRate)), show(run.hitRateEffective === null ? null : `effective ${pct(run.hitRateEffective)}`, esc))}
      ${kpi("Model tested", `<span class="small mono">${esc(run.model)}</span>`, `${run.mode} mode`)}
      ${kpi("Inconclusive", show(run.inconclusiveMissCount), "search-degraded misses")}
    </div>
    ${table({
      head: [
        { label: "ID" },
        { label: "Archetype" },
        { label: "Fidelity", num: true },
        { label: "Retrieval" },
        { label: "Hallucinations", num: true },
        { label: "Prompt" },
      ],
      rows,
    })}
    <h3>Per-probe detail</h3>
    ${detailCards}
  </div>`;
}

function renderAntiPatterns(page) {
  const a = page.audit;
  return `<div class="tabpanel" id="tab-${esc(page.slug)}-anti" hidden>
    <h3>Anti-patterns found</h3>
    ${
      a.antiPatterns.length
        ? `<ul class="tight">${a.antiPatterns.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`
        : `<p class="muted">None recorded.</p>`
    }
    <h3>Off-page / out-of-scope notes</h3>
    ${
      a.offPageNotes.length
        ? `<ul class="tight">${a.offPageNotes.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`
        : `<p class="muted">None recorded.</p>`
    }
  </div>`;
}

function renderPages({ pages }) {
  const pickers = pages
    .map(
      (p, i) =>
        `<button data-target="detail-${esc(p.slug)}" aria-selected="${i === 0}">${esc(p.title)}</button>`,
    )
    .join("");

  const details = pages
    .map(
      (p, i) => `<div class="pagedetail" id="detail-${esc(p.slug)}"${i === 0 ? "" : " hidden"}>
    <h2>${esc(p.title)}</h2>
    <p class="muted small"><a href="${esc(p.url)}" rel="noreferrer">${esc(p.url)}</a><br>
      ${esc(p.contentType ?? "")} · analyzed ${esc((p.analyzedAt ?? "").slice(0, 10))} · <span class="mono">${esc(p.auditFile)}</span></p>
    <div class="tabs">
      <button data-target="tab-${esc(p.slug)}-score" aria-selected="true">Scorecard</button>
      <button data-target="tab-${esc(p.slug)}-recs" aria-selected="false">Recommendations (${p.audit.recommendations.length})</button>
      <button data-target="tab-${esc(p.slug)}-probes" aria-selected="false">Probes${p.primaryRun ? ` (${p.primaryRun.probeCount})` : ""}</button>
      <button data-target="tab-${esc(p.slug)}-anti" aria-selected="false">Anti-patterns</button>
    </div>
    ${renderScorecard(p)}
    ${renderRecommendations(p)}
    ${renderProbes(p)}
    ${renderAntiPatterns(p)}
  </div>`,
    )
    .join("");

  return `<section class="view" id="view-pages" hidden>
    <div class="pagepick">${pickers}</div>
    ${details}
  </section>`;
}

// ------------------------------------------------------------ answer quality --

function renderQuality({ pages, aggregates: agg }) {
  if (!agg.probeCount) {
    return `<section class="view" id="view-quality" hidden>
      <p class="muted">No probe runs yet. Answer-quality analysis becomes available once
      <code>geo-audit probe</code> has been run for at least one page.</p>
    </section>`;
  }

  const { hit, miss, delta } = agg.fidelityByRetrieval;
  const h = agg.hallucinations;

  const archetypeRows = agg.byArchetype.map(
    (a) => `<tr>
      ${cell(`<span class="pill">${esc(a.archetype)}</span>`, { sortValue: a.archetype })}
      ${cell(String(a.n), { num: true, sortValue: a.n })}
      ${cell(`<div class="barrow">${bar(a.avgFidelity, 100)}<span class="mono small">${a.avgFidelity}</span></div>`, {
        num: true,
        sortValue: a.avgFidelity,
      })}
      ${cell(pct(a.hitRate), { num: true, sortValue: a.hitRate })}
    </tr>`,
  );

  const typeRows = Object.entries(h.byType)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([type, count]) => `<tr>
      ${cell(`<span class="mono small">${esc(type)}</span>`, { sortValue: type })}
      ${cell(String(count), { num: true, sortValue: count })}
      ${cell(`<div class="barrow">${bar(count, h.total)}<span class="mono small">${Math.round((count / h.total) * 100)}%</span></div>`, { sortValue: count })}
    </tr>`,
    );

  // Worst offenders: high-severity claims, most damaging first.
  const worst = pages
    .filter((p) => p.primaryRun)
    .flatMap((p) =>
      p.primaryRun.probes.flatMap((probe) =>
        probe.hallucinations
          .filter((x) => x.severity === "high")
          .map((x) => ({ ...x, page: p.title, probe: probe.id })),
      ),
    )
    .slice(0, 12);

  const funnel = agg.funnel;

  return `<section class="view" id="view-quality" hidden>
    <div class="kpis">
      ${kpi("Probes run", agg.probeCount, `across ${agg.probedPageCount} pages`)}
      ${kpi("Hallucinations", h.total, `${h.probesAffected}/${agg.probeCount} probes affected`)}
      ${kpi("High severity", h.highSeverity, "wrong in a way that misleads")}
      ${kpi("Retrieval lift", `+${delta}`, "fidelity points per hit")}
    </div>

    <h2>What retrieval is worth</h2>
    <div class="gap">
      <div class="row"><div class="name">Cited the source <span class="faint">n=${hit.n}</span></div>
        <div class="metric"><span class="k">fidelity</span>${bar(hit.avgFidelity ?? 0, 100, "score")}<span class="v">${show(hit.avgFidelity)}</span></div></div>
      <div class="row"><div class="name">Did not cite it <span class="faint">n=${miss.n}</span></div>
        <div class="metric"><span class="k">fidelity</span>${bar(miss.avgFidelity ?? 0, 100, "fid")}<span class="v">${show(miss.avgFidelity)}</span></div></div>
    </div>

    ${
      funnel
        ? `<h2>Retrieval funnel</h2>
    <p class="muted small">Based on the ${funnel.n} probe(s) whose run recorded search-health counters.
    Earlier runs predate them and are excluded rather than counted as zero.</p>
    ${table({
      head: [{ label: "Stage" }, { label: "Probes", num: true }, { label: "Of total", num: true }],
      rows: [
        ["Attempted a search", funnel.searched],
        ["Search returned results", funnel.gotResults],
        ["Cited the expected source", funnel.citedSource],
        ["Answered accurately (fidelity ≥ 70)", funnel.accurate],
      ].map(
        ([label, n]) =>
          `<tr>${cell(esc(label), { sortValue: label })}${cell(String(n), { num: true, sortValue: n })}${cell(
            `<div class="barrow">${bar(n, funnel.n)}<span class="mono small">${Math.round((n / funnel.n) * 100)}%</span></div>`,
            { sortValue: n },
          )}</tr>`,
      ),
    })}`
        : ""
    }

    <h2>Failure by question phrasing</h2>
    <p class="muted small">Which ways of asking the question the docs fail to answer — the most directly actionable table here.</p>
    ${table({
      head: [
        { label: "Archetype" },
        { label: "n", num: true },
        { label: "Avg fidelity", num: true },
        { label: "Hit rate", num: true },
      ],
      rows: archetypeRows,
    })}

    <h2>Hallucination taxonomy</h2>
    <p class="muted small">${h.total} across ${agg.probeCount} probes ·
      high ${h.bySeverity.high ?? 0} · medium ${h.bySeverity.med ?? 0} · low ${h.bySeverity.low ?? 0}</p>
    ${table({
      head: [{ label: "Type" }, { label: "Count", num: true }, { label: "Share" }],
      rows: typeRows,
    })}

    ${
      worst.length
        ? `<h3>High-severity claims</h3>
    <ul class="tight">${worst
      .map(
        (w) =>
          `<li><span class="faint small mono">${esc(w.probe)} · ${esc(w.page)}</span><br>${inline(w.claim)}</li>`,
      )
      .join("")}</ul>`
        : ""
    }
  </section>`;
}

// --------------------------------------------------------------- methodology --

function renderMethodology({ pages, aggregates: agg, generatedAt }) {
  const runs = pages.flatMap((p) =>
    p.probeRuns.map((r) => `<tr>
      ${cell(esc(p.title), { sortValue: p.title })}
      ${cell(`<span class="mono small">${esc(r.model)}</span>`, { sortValue: r.model })}
      ${cell(esc(r.mode), { sortValue: r.mode })}
      ${cell(String(r.probeCount), { num: true, sortValue: r.probeCount })}
      ${cell(esc((r.runAt ?? "").slice(0, 10)), { sortValue: r.runAt })}
      ${cell(`<span class="mono small">${esc(r.graderModel)}</span>`, { sortValue: r.graderModel })}
    </tr>`),
  );

  const variants = pages
    .filter((p) => p.auditVariants.length > 1)
    .flatMap((p) =>
      p.auditVariants.map(
        (v) => `<tr>
        ${cell(esc(p.title), { sortValue: p.title })}
        ${cell(`<span class="mono small">${esc(v.file)}</span>`, { sortValue: v.file })}
        ${cell(String(v.score), { num: true, sortValue: v.score })}
        ${cell(`<span class="${bandClass(v.band)}">${esc(v.band)}</span>`, { sortValue: v.score })}
        ${cell(esc((v.analyzedAt ?? "").slice(0, 10)), { sortValue: v.analyzedAt })}
      </tr>`,
      ),
    );

  const dimensionRows = agg.dimensionMeans
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map(
      (d) => `<tr>${cell(esc(d.name), { sortValue: d.name })}${cell(String(d.weight), {
        num: true,
        sortValue: d.weight,
      })}${cell(d.mean.toFixed(1), { num: true, sortValue: d.mean })}</tr>`,
    );

  return `<section class="view" id="view-method" hidden>
    <h2>How to read this</h2>
    <p><strong>GEO score</strong> rates the page against a 9-dimension rubric, weighted to 100. It measures how
    well the page is <em>built</em> for generative retrieval.</p>
    <p><strong>Fidelity</strong> is different and more important: a model is asked realistic developer questions,
    and its answers are graded against this page as the sole ground truth. It measures what readers
    <em>actually get</em>. A high score with low fidelity means the page is well-built but not reaching the model.</p>

    <h3>Rubric</h3>
    ${table({
      head: [{ label: "Dimension" }, { label: "Weight", num: true }, { label: "Corpus mean /10", num: true }],
      rows: dimensionRows,
    })}
    <p class="muted small">Bands: 0–39 Poor · 40–59 Developing · 60–74 Good · 75–89 Strong · 90–100 Exemplary.</p>

    <h3>Probe runs</h3>
    ${
      runs.length
        ? table({
            head: [
              { label: "Page" },
              { label: "Model tested" },
              { label: "Mode" },
              { label: "Probes", num: true },
              { label: "Run" },
              { label: "Grader" },
            ],
            rows: runs,
          })
        : `<p class="muted">No probe runs recorded.</p>`
    }

    ${
      variants.length
        ? `<h3>Run-to-run variance</h3>
    <p>Scoring is LLM-judged and not perfectly repeatable. Where a page was scored more than once, every
    score is shown. The dashboard uses the probe-informed re-score where one exists.</p>
    ${table({
      head: [{ label: "Page" }, { label: "Report" }, { label: "Score", num: true }, { label: "Band" }, { label: "Analyzed" }],
      rows: variants,
    })}`
        : ""
    }

    <h3>Caveats</h3>
    <ul class="tight">
      ${agg.coverageNotes.map((n) => `<li>${esc(n)}</li>`).join("")}
      <li>Fidelity is graded against the page alone. A model answer that is correct but sourced elsewhere still scores low — that is intentional.</li>
      <li>Retrieval misses caused by search rate limits are flagged inconclusive and excluded from effective hit rates.</li>
      <li>Superseded reports (<span class="mono">*-old.*</span>) are excluded from all figures.</li>
    </ul>

    <h3>Provenance</h3>
    <p class="muted small">Generated ${esc(generatedAt)} by <code>geo-audit dashboard</code> from the
    contents of <code>results/</code>. No data outside that directory is read or embedded.</p>
  </section>`;
}

// ------------------------------------------------------------------- document --

/** Render the full dashboard document. */
export function render(data) {
  const { aggregates: agg } = data;
  const title = "GEO Audit Dashboard";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1>${esc(title)}</h1>
    <div class="sub">${agg.pageCount} pages · ${agg.probeCount} probes ·
      generated ${esc(data.generatedAt.slice(0, 10))}</div>
    <nav class="pages">
      <button data-target="view-overview" aria-selected="true">Overview</button>
      <button data-target="view-pages" aria-selected="false">Pages</button>
      <button data-target="view-quality" aria-selected="false">Answer quality</button>
      <button data-target="view-method" aria-selected="false">Methodology</button>
    </nav>
  </header>

  ${renderOverview(data)}
  ${renderPages(data)}
  ${renderQuality(data)}
  ${renderMethodology(data)}
</div>
<script>${JS}</script>
</body>
</html>
`;
}
