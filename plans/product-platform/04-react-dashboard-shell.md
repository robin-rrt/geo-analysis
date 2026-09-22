# 4 — React dashboard: information architecture, navigation, themes

**Type:** ♻️ refactor (replaces the current renderer) · **Depends on:** plans 2 **and 3**

## Problem

The current dashboard is a 787-line string-templating renderer
([src/dashboard/render.js](../../src/dashboard/render.js)) emitting one 327KB HTML file. It has no
routes, no search, no pagination, no way to trigger anything, and a single flat structure. It cannot
become the product described in the brief by extension — it needs replacing.

## Solution

React + Vite in `ui/`, consuming the plan-2 projections. The Node side stays dependency-light; all
UI dependencies are confined to `ui/package.json` so the CLI keeps its current 4-dep footprint.

> **Dependency on plan 3 is hard, not optional.** An earlier draft called it optional. It is not:
> the target picker's sitemap autocomplete comes from `GET /api/targets`, `ui/vite.config.js` proxies
> to `geo-audit serve` for the dev loop, and the data client must speak the API. Only the *live-run
> progress* routes are deferrable.
>
> **Two transports, one interface.** `ui/src/api/client.js` is built from the start against an
> interface with two implementations — the plan-3 API, and static sibling-JSON for the plan-5 export.
> Building against only one means rewriting the client later.

### Reuse rather than rebuild

- [`theme.js`](../../src/dashboard/theme.js) is already a complete two-theme custom-property set
  (21 tokens, including band and severity colours). `ui/src/theme/tokens.css` is a **port** of it
  plus a `data-theme` override — not a new design system.
- [`render.js`](../../src/dashboard/render.js) already has `bar()`, `kpi()` and `table()`; their
  markup and class names are the reference for the React equivalents.
- [`parse-audit.js`](../../src/dashboard/parse-audit.js) (299 lines) is the disk→model layer and is
  **kept**, not reimplemented.

### Modules that must not be orphaned

The rewrite deletes `render.js`, but four modules currently hang off it and need explicit homes,
or features disappear silently:

| module | disposition |
|---|---|
| `parse-audit.js` | keep — feeds the store |
| `collect.js` | amended by plan 2, kept |
| `products.js` | folded into the store's product projection |
| `matrix.js` (`pivotRuns`, `toCsv`, `probe-matrix.csv` at [cli.js:460](../../src/cli.js#L460)) | **keep the CSV export**; surface it as a download on the Product route |

### Information architecture

Navigation is organised by the question being asked, not by the artifact type. Two audiences, one
tree, drilling from summary to evidence:

```
Overview            leadership landing — portfolio health, trends, what changed
  └ Products        one card per product: coverage, page quality, measured fidelity
      └ Product     pages table (paginated, sortable, filterable) + rollup + fix backlog
          └ Page    audit, dimensions, measured facts, probes, answers, history
Runs                run history, status, cost, live progress
  └ Run             per-page progress, logs, artifacts produced
Watchlists          curated sets; run a routine check
```

`Overview → Product → Page` is the leadership drill-down path. `Watchlists → run` is the team's
routine-check path. Both are reachable in two clicks from the landing page.

### Routing and state

- `react-router` for routes; URL is the source of truth for filters, sort, page number and selected
  tab, so any view is shareable — "look at this page's regression" must be a link.
- Server state via `@tanstack/react-query` — caching, background refetch, and `refetchInterval`
  polling for live runs (plan 3 uses polling, not SSE). Avoids hand-rolling fetch/loading/error
  in every component, and is the single dependency that earns its keep most clearly here.
- No global state library. Route + query cache is sufficient; adding Redux here would be ceremony.

### Table UX — where the brief's "pagination and best practices" lands

The pages table is the workhorse. Requirements:

- Server-side-shaped pagination over `dashboard/index.json` (25/50/100 per page), page number in URL
- Sort by any column; filter by band, product, score range, last-run age
- Text search across title and URL, debounced
- Sticky header, keyboard navigable rows, visible focus rings
- **Empty, loading and error states for every view** — a blank screen is a bug
- Skeleton rows on load, not a spinner that shifts layout

### Dark and light modes

`theme.js` currently only honours `prefers-color-scheme`
([src/dashboard/theme.js:23](../../src/dashboard/theme.js#L23)) — there is no toggle.

- Three-state control: Light / Dark / System, persisted to `localStorage`
- CSS custom properties for every colour; no hard-coded hex in components
- Applied via `data-theme` on `:root`, with the explicit choice overriding the media query in both
  directions
- **Charts inherit theme tokens** — chart colour is the most common thing to hard-code and the most
  obvious break in dark mode
- No flash of wrong theme: resolve and set `data-theme` in a tiny inline script before first paint

### Accessibility

Not optional for something leadership opens on unknown hardware.

- WCAG AA contrast in both themes, verified per token pair
- Full keyboard operation: nav, table, tabs, dialogs
- Visible focus states; correct roles on tabs and dialogs; focus trapped in modals
- **Colour is never the only signal** — bands carry a label or shape as well as a colour, which also
  covers colour-blind viewers and greyscale printing for a deck

### Accuracy rules the UI must enforce

From the [README](README.md) product rule — these are component-level, not copy suggestions:

- A fidelity figure is **never rendered without its grader**. There is no TypeScript here, so this
  is enforced as a **runtime invariant**: `FidelityBadge` throws when `graderModel` is missing, and a
  unit test asserts the throw. An earlier draft called it "a type error", which is unimplementable in
  a zero-build JS repo.
- Structural score is labelled *page quality*, never *effectiveness*.
- Retrieval figures carry the `any-citation` overcount caveat via an info affordance.
- A score and a fidelity number are never summed, averaged, or shown as one composite.

## Files

| file | action |
|---|---|
| `ui/package.json` | new — React, Vite, router, react-query (UI deps isolated here) |
| `ui/vite.config.js` | new — dev proxy to `geo-audit serve`; single-file export config (plan 5) |
| `ui/dist/` | **committed build output** — see the build-step decision below |
| `ui/src/routes/` | new — Overview, Products, Product, Page, Runs, Run, Watchlists (Settings dropped; theme lives in the header, ceilings are flags) |
| `ui/src/components/DataTable.jsx` | new — pagination, sort, filter, URL sync |
| `ui/src/components/ThemeToggle.jsx` | new — Light/Dark/System |
| `ui/src/components/FidelityBadge.jsx` | new — **requires** `graderModel` |
| `ui/src/components/EmptyState.jsx` | new |
| `ui/src/theme/tokens.css` | new — custom properties, both themes |
| `ui/src/api/client.js` | new — typed fetch wrappers |
| `ui/src/components/TargetPicker.jsx` | new — product / watchlist / single page, with **sitemap-backed autocomplete** |
| `src/dashboard/render.js` | **delete** once parity is reached |
| `src/cli.js` | `dashboard` **copies prebuilt `ui/dist`** and writes projections beside it — it does **not** invoke a bundler |
| `ui/src/**/*.test.jsx` | new — Vitest + Testing Library |

## Acceptance criteria

- [ ] Every route renders with loading, empty and error states
- [ ] Pagination, sort, filter and search all round-trip through the URL; a pasted link reproduces the view
- [ ] Table renders a 1,465-row index with **interaction-to-paint under 100ms** on sort/filter/page change (measured, not judged)
- [ ] Theme toggle offers Light/Dark/System, persists, and overrides the media query in both directions
- [ ] No flash of incorrect theme on load
- [ ] No hard-coded colours — enforced by `stylelint` rule `color-no-hex` over `ui/src/**/*.css` and an ESLint rule banning hex literals in `.jsx`
- [ ] WCAG AA contrast verified for every foreground/background token pair in both themes, by a script over `tokens.css` (not by eye)
- [ ] Every view is fully keyboard operable with visible focus
- [ ] Target picker offers product, watchlist, and single page with autocomplete over sitemap URLs
- [ ] Band indicators carry a non-colour signal
- [ ] `FidelityBadge` **throws** without `graderModel`; test asserts it
- [ ] `probe-matrix.csv` remains downloadable; no existing feature is dropped silently
- [ ] Parity checklist against `render.js` is enumerated and every item ticked **before** deletion
- [ ] No component computes a value from both a structural score and a fidelity figure (enforced by review of the two selector modules, which are the only places aggregates are derived)
- [ ] CLI runtime deps remain 4 — UI deps live only in `ui/package.json`
- [ ] `npm test` and `npm --prefix ui test` both pass

## Risks

| risk | mitigation |
|---|---|
| Build step breaks the zero-install property | **Decided: `ui/dist` is committed.** `geo-audit serve` and `dashboard` serve/copy prebuilt assets, so installing the CLI never requires a bundler. Contributors touching `ui/` run Vite; users never do. The cost is a generated artifact in git, accepted deliberately to preserve zero-install |
| React deps leak into the CLI | Separate `ui/package.json`; CI asserts the root dependency count |
| Rewrite loses features of the current dashboard | Parity checklist against `render.js` before deleting it |
| Dark mode ships broken in charts | Token-only colours; lint rule; visual check in both themes |

## Out of scope

Charts and the leadership report — plan 5. Plan 4 delivers the shell, navigation and data plumbing
those sit inside.
