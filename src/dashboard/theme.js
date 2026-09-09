// Styles and client behaviour for the dashboard, exported as strings and inlined
// at render time so the output file has no external requests of any kind.

export const CSS = `
:root {
  --bg: #ffffff;
  --surface: #f7f7f8;
  --border: #e3e3e6;
  --text: #16161a;
  --muted: #6a6a73;
  --faint: #9a9aa3;
  --accent: #2f5eea;
  --track: #ececef;
  --band-poor: #c0392b;
  --band-developing: #c77700;
  --band-good: #9a8500;
  --band-strong: #2e7d4f;
  --band-exemplary: #16736b;
  --sev-high: #c0392b;
  --sev-med: #c77700;
  --sev-low: #8a8a93;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121215; --surface: #1a1a1f; --border: #2c2c33; --text: #ececef;
    --muted: #9b9ba4; --faint: #6e6e77; --accent: #7d9bff; --track: #26262c;
    --band-poor: #e8695a; --band-developing: #e0a33e; --band-good: #cbb52f;
    --band-strong: #5fbd88; --band-exemplary: #4fb8ad;
    --sev-high: #e8695a; --sev-med: #e0a33e; --sev-low: #8a8a93;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px 96px; }
h1, h2, h3, h4 { line-height: 1.25; margin: 0; font-weight: 600; }
h1 { font-size: 20px; letter-spacing: -0.01em; }
h2 { font-size: 17px; margin: 40px 0 14px; }
h3 { font-size: 15px; margin: 26px 0 10px; }
p { margin: 0 0 12px; max-width: 74ch; }
a { color: var(--accent); }
code {
  font: 12.5px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 4px; padding: 0.5px 4px;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.muted { color: var(--muted); }
.faint { color: var(--faint); }
.small { font-size: 13px; }

header.top { border-bottom: 1px solid var(--border); margin-bottom: 28px; padding: 26px 0 0; }
header.top .sub { color: var(--muted); font-size: 13px; margin-top: 5px; }
nav.pages { display: flex; gap: 4px; margin-top: 20px; flex-wrap: wrap; }
nav.pages button, .tabs button, .pagepick button {
  font: inherit; font-size: 13.5px; color: var(--muted); background: none;
  border: 0; border-bottom: 2px solid transparent; padding: 8px 12px;
  cursor: pointer; border-radius: 4px 4px 0 0;
}
nav.pages button:hover, .tabs button:hover, .pagepick button:hover { color: var(--text); background: var(--surface); }
nav.pages button[aria-selected="true"], .tabs button[aria-selected="true"] {
  color: var(--text); border-bottom-color: var(--accent); font-weight: 600;
}
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin: 18px 0 20px; flex-wrap: wrap; }
.pagepick { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.pagepick button { border: 1px solid var(--border); border-radius: 6px; }
.pagepick button[aria-selected="true"] { background: var(--surface); color: var(--text); font-weight: 600; border-color: var(--faint); }

[hidden] { display: none !important; }

.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 22px 0 8px; }
.kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
.kpi .label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.kpi .value { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; margin-top: 4px; }
.kpi .note { font-size: 12px; color: var(--faint); margin-top: 2px; }

.tablewrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { font-weight: 600; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
th[data-sort] { cursor: pointer; user-select: none; }
th[data-sort]:hover { color: var(--text); }
th[data-sort]::after { content: " ↕"; color: var(--faint); font-size: 10px; }
th[data-sort][aria-sort="ascending"]::after { content: " ↑"; color: var(--accent); }
th[data-sort][aria-sort="descending"]::after { content: " ↓"; color: var(--accent); }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--surface); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

.bar { background: var(--track); border-radius: 3px; height: 7px; overflow: hidden; min-width: 60px; }
.bar > i { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
.barrow { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }

.gap { display: grid; gap: 10px; margin-top: 14px; }
.gap .row { display: grid; grid-template-columns: minmax(120px, 200px) 1fr; gap: 14px; align-items: center; }
.gap .name { font-size: 13px; }
.gap .pair { display: grid; gap: 4px; }
.gap .metric { display: grid; grid-template-columns: 62px 1fr 46px; gap: 8px; align-items: center; font-size: 12px; }
.gap .metric .k { color: var(--muted); }
.gap .metric .v { text-align: right; font-variant-numeric: tabular-nums; }
.gap i.score { background: var(--accent); }
.gap i.fid { background: var(--band-developing); }

.band { font-weight: 600; }
.band-poor { color: var(--band-poor); }
.band-developing { color: var(--band-developing); }
.band-good { color: var(--band-good); }
.band-strong { color: var(--band-strong); }
.band-exemplary { color: var(--band-exemplary); }

.pill {
  display: inline-block; font-size: 11.5px; padding: 1px 7px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--surface); color: var(--muted); white-space: nowrap;
}
.pill.p1 { color: var(--band-poor); border-color: currentColor; }
.pill.p2 { color: var(--band-developing); border-color: currentColor; }
.pill.p3 { color: var(--muted); }
.pill.hit { color: var(--band-strong); border-color: currentColor; }
.pill.miss { color: var(--band-poor); border-color: currentColor; }
.sev-high { color: var(--sev-high); font-weight: 600; }
.sev-med { color: var(--sev-med); }
.sev-low { color: var(--sev-low); }

.card { border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; background: var(--surface); }
.card h4 { font-size: 14px; margin-bottom: 8px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.card dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; }
.card dt { color: var(--muted); white-space: nowrap; }
.card dd { margin: 0; }

.note { border-left: 2px solid var(--border); padding: 2px 0 2px 12px; color: var(--muted); font-size: 13px; margin: 10px 0; }
ul.tight { margin: 8px 0; padding-left: 20px; }
ul.tight li { margin-bottom: 5px; max-width: 74ch; }
details { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px; }
details summary { cursor: pointer; font-size: 13px; color: var(--muted); }
details summary:hover { color: var(--text); }
details pre {
  white-space: pre-wrap; word-wrap: break-word; font-size: 12.5px; line-height: 1.55;
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 12px; overflow-x: auto;
}
.dimgrid { display: grid; gap: 12px; }
/* Middle column must fit bar (60) + gap (10) + "10/10" so the score never
   collides with the analysis prose in the third column. */
.dim { display: grid; grid-template-columns: minmax(140px, 260px) 124px 1fr; gap: 16px; align-items: start; font-size: 13px; }
.dim .wt { color: var(--faint); font-size: 12px; }
@media (max-width: 720px) {
  .wrap { padding: 0 16px 64px; }
  .dim, .gap .row { grid-template-columns: 1fr; gap: 4px; }
  .kpi .value { font-size: 22px; }
}
`;

export const JS = `
(function () {
  function activate(buttons, panels, id) {
    buttons.forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.target === id)); });
    panels.forEach(function (p) { p.hidden = p.id !== id; });
  }

  // Top-level page navigation.
  var navButtons = Array.prototype.slice.call(document.querySelectorAll('nav.pages button'));
  var views = Array.prototype.slice.call(document.querySelectorAll('section.view'));
  navButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activate(navButtons, views, btn.dataset.target);
      window.scrollTo(0, 0);
    });
  });

  // Per-page detail: which page, then which tab within it.
  var pickers = Array.prototype.slice.call(document.querySelectorAll('.pagepick button'));
  var details = Array.prototype.slice.call(document.querySelectorAll('.pagedetail'));
  pickers.forEach(function (btn) {
    btn.addEventListener('click', function () { activate(pickers, details, btn.dataset.target); });
  });

  document.querySelectorAll('.pagedetail').forEach(function (detail) {
    var tabs = Array.prototype.slice.call(detail.querySelectorAll('.tabs button'));
    var panels = Array.prototype.slice.call(detail.querySelectorAll('.tabpanel'));
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () { activate(tabs, panels, btn.dataset.target); });
    });
  });

  // Deep links from the corpus table into a page's detail view.
  document.querySelectorAll('[data-goto]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      activate(navButtons, views, 'view-pages');
      var target = link.dataset.goto;
      pickers.forEach(function (b) { if (b.dataset.target === target) b.click(); });
      window.scrollTo(0, 0);
    });
  });

  // Sortable tables. Values come from data-v attributes so text and numbers
  // sort correctly; '—' (unknown) always sorts last regardless of direction.
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var table = th.closest('table');
      var tbody = table.tBodies[0];
      var index = Array.prototype.indexOf.call(th.parentNode.children, th);
      var desc = th.getAttribute('aria-sort') !== 'descending';

      th.parentNode.querySelectorAll('th').forEach(function (o) { o.removeAttribute('aria-sort'); });
      th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');

      var rows = Array.prototype.slice.call(tbody.rows);
      rows.sort(function (a, b) {
        var av = a.cells[index].dataset.v, bv = b.cells[index].dataset.v;
        var aMissing = av === undefined || av === '', bMissing = bv === undefined || bv === '';
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        if (aMissing) return 0;
        var an = parseFloat(av), bn = parseFloat(bv);
        var cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv));
        return desc ? -cmp : cmp;
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
    });
  });
})();
`;
