# 4 — React dashboard: information architecture, navigation, themes

**Type:** ♻️ refactor (replaces the current renderer) · **Depends on:** plan 2 (plan 3 for live runs)

## Problem

The current dashboard is a 787-line string-templating renderer
([src/dashboard/render.js](../../src/dashboard/render.js)) emitting one 327KB HTML file. It has no
routes, no search, no pagination, no way to trigger anything, and a single flat structure. It cannot
become the product described in the brief by extension — it needs replacing.

## Solution

React + Vite in `ui/`, consuming the plan-2 projections. The Node side stays dependency-light; all
UI dependencies are confined to `ui/package.json` so the CLI keeps its current 4-dep footprint.

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
Watchlists          curated sets; edit membership; run a routine check
Settings            theme, protocol defaults, cost ceiling
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

- A fidelity figure is **never rendered without its grader**. The component requires `graderModel`
  as a prop; omitting it is a type error, not a silent default.
- Structural score is labelled *page quality*, never *effectiveness*.
- Retrieval figures carry the `any-citation` overcount caveat via an info affordance.
- A score and a fidelity number are never summed, averaged, or shown as one composite.

## Files

| file | action |
|---|---|
| `ui/package.json` | new — React, Vite, router, react-query (UI deps isolated here) |
| `ui/vite.config.js` | new — dev proxy to `geo serve`; single-file export config (plan 5) |
| `ui/src/routes/` | new — Overview, Products, Product, Page, Runs, Run, Watchlists, Settings |
| `ui/src/components/DataTable.jsx` | new — pagination, sort, filter, URL sync |
| `ui/src/components/ThemeToggle.jsx` | new — Light/Dark/System |
| `ui/src/components/FidelityBadge.jsx` | new — **requires** `graderModel` |
| `ui/src/components/EmptyState.jsx` | new |
| `ui/src/theme/tokens.css` | new — custom properties, both themes |
| `ui/src/api/client.js` | new — typed fetch wrappers |
| `ui/src/components/TargetPicker.jsx` | new — product / watchlist / single page, with **sitemap-backed autocomplete** |
| `src/dashboard/render.js` | **delete** once parity is reached |
| `src/cli.js` | `dashboard` builds the React app instead of string templates |
| `ui/src/**/*.test.jsx` | new — Vitest + Testing Library |

## Acceptance criteria

- [ ] Every route renders with loading, empty and error states
- [ ] Pagination, sort, filter and search all round-trip through the URL; a pasted link reproduces the view
- [ ] Table handles a 1,465-row index without jank (measured, synthetic fixture)
- [ ] Theme toggle offers Light/Dark/System, persists, and overrides the media query in both directions
- [ ] No flash of incorrect theme on load
- [ ] Charts and all components read theme tokens; no hard-coded colours (lint rule)
- [ ] WCAG AA contrast verified for both themes
- [ ] Every view is fully keyboard operable with visible focus
- [ ] Target picker offers product, watchlist, and single page with autocomplete over sitemap URLs
- [ ] Band indicators carry a non-colour signal
- [ ] `FidelityBadge` cannot be rendered without `graderModel`
- [ ] No view displays a composite of structural score and fidelity
- [ ] CLI runtime deps remain 4 — UI deps live only in `ui/package.json`
- [ ] `npm test` and `npm --prefix ui test` both pass

## Risks

| risk | mitigation |
|---|---|
| Build step breaks the zero-install property | `ui/dist` is committed or built in release; `geo serve` serves prebuilt assets so users need no toolchain |
| React deps leak into the CLI | Separate `ui/package.json`; CI asserts the root dependency count |
| Rewrite loses features of the current dashboard | Parity checklist against `render.js` before deleting it |
| Dark mode ships broken in charts | Token-only colours; lint rule; visual check in both themes |

## Out of scope

Charts and the leadership report — plan 5. Plan 4 delivers the shell, navigation and data plumbing
those sit inside.
