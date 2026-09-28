# 7 — Chainlink brand alignment

**Type:** ♻️ refactor (visual layer) · **Depends on:** plans 4–6 (shipped) · **Created:** 2026-09-28

## Overview

The dashboard is going in front of Chainlink leadership and will be published on a
Chainlink-owned domain, but its visual language is generic. Bring it onto the brand defined at
[chain.link/brand-assets](https://chain.link/brand-assets) without losing the two things the
current design does well: colour that carries meaning, and figures that read as measurements.

## Brand facts, from the source

| token | value |
|---|---|
| Chainlink Blue | `#0847F7` |
| Dark | `#0E1119` |
| Light Blue | `#DCEBFF` |
| Light Gray | `#F5F7FA` |
| Primary typeface | **TASA Orbiter** — open source, free for commercial use, on GitHub |
| Secondary typeface | **Inter** — open source, Google Fonts |
| Logo | full lockup + symbol, each in Blue / White / Black, SVG and PNG |
| Clear space | logo never placed over other objects; keep margin around it |

Third-party use is governed by Chainlink's Trademark Guidelines (see open questions).

## Three constraints this has to solve

### 1. The brand blue fails on the brand dark — measured

| pairing | ratio | AA body | AA large |
|---|--:|---|---|
| Blue on white | 6.45 | pass | pass |
| Blue on Light Gray | 6.01 | pass | pass |
| Blue on Light Blue | 5.34 | pass | pass |
| **Blue on Dark** | **2.92** | **fail** | **fail** |
| White on Dark | 18.87 | pass | pass |
| White on Blue | 6.45 | pass | pass |

`#0847F7` on `#0E1119` is unusable for text or for a thin chart line. The dashboard ships a dark
theme, so this is not avoidable: **dark mode needs a lightened accent** derived from the brand blue
rather than the brand blue itself. Picking one is a design decision, not an oversight — it should
be chosen to hit ≥4.5:1 on `#0E1119` and documented as an explicitly derived token so nobody
"corrects" it back to the brand value later.

### 2. Colour already carries meaning, and it is not the brand's

The rubric has five bands — Poor, Developing, Good, Strong, Exemplary — encoded as five colours
across 14 token references. The brand palette is one blue plus neutrals. These cannot both own
colour.

**Proposed resolution:** brand colour owns *identity*, semantic colour owns *data*.

- Chainlink Blue becomes the accent for chrome: links, the active nav rule, focus rings, the
  headline scale marker where no band applies, the logo.
- Band colours stay semantic and keep their current hues, tuned for harmony beside the brand blue
  rather than replaced by it.

The alternative — recolouring bands into a blue monochrome ramp — would look more "on brand" and
would destroy the distinction between a Poor page and a Strong one at a glance. The measurement is
the product; the brand is the frame around it.

### 3. TASA Orbiter is embeddable, and that changes an earlier decision

Earlier the UI deliberately used a system stack, on the grounds that the export is a single
self-contained file under a strict CSP and no external font can be fetched. TASA Orbiter is
open source and self-hostable, so that reasoning no longer holds — the font can be **subsetted and
base64-embedded** into the bundle.

Cost: a subsetted single-weight woff2 is typically 15–30KB, ~33% larger as base64, against a
256KB export. Two weights (regular + medium) is the realistic minimum for a UI.

This is a deliberate trade to price, not an automatic yes: roughly +10–25% bundle for the
typeface that makes the page unmistakably Chainlink. Recommend **two weights, Latin subset**, with
the system stack retained as the fallback so nothing breaks if the face fails to decode.

## Proposed solution

Keep the editorial structure from plan 6 — rules not boxes, figures as heroes, asymmetric columns.
Change the surface:

| layer | change |
|---|---|
| Typography | TASA Orbiter for display figures and headings; Inter for body and tables; monospace unchanged for identifiers |
| Accent | Chainlink Blue in light mode; a derived lightened blue in dark mode, ≥4.5:1 on `#0E1119` |
| Surfaces | Light Gray `#F5F7FA` for the light theme's recessed surfaces; Dark `#0E1119` as the dark theme's base |
| Light Blue | `#DCEBFF` for selected rows, info callouts, and the scale track |
| Logo | symbol in the nav, at the documented clear space; full lockup on the exported report header |
| Bands | retained semantically, re-tuned for harmony rather than replaced |

### Where the serif goes

Plan 6 introduced a serif for display figures, chosen when no brand face was available. TASA
Orbiter supersedes it: a brand-aligned display face does the same job — giving the numbers a voice
— while also being on brand. The serif comes out.

## Acceptance criteria

- [ ] Every foreground/background token pair passes **WCAG AA in both themes**, verified by the
      existing contrast script rather than by eye
- [ ] Dark mode uses a derived accent, not `#0847F7`, and the token carries a comment saying why
- [ ] Band colours remain five visually distinct hues; a Poor page and a Strong page are
      distinguishable at a glance and in greyscale
- [ ] Band indicators still carry a text label — colour is never the only signal
- [ ] TASA Orbiter is embedded as a subset with a system fallback; the page is readable if the
      font fails
- [ ] Export bundle stays **under 320KB** (currently 256KB)
- [ ] Logo respects the clear-space rule and is never composited over other elements
- [ ] No composite of page quality and fidelity is introduced — the product rule from
      [README](README.md) survives the restyle
- [ ] Both themes verified; no flash of unstyled or wrong-theme content on load
- [ ] `npm --prefix ui test` passes, including the existing design-consistency tests

## Risks

| risk | mitigation |
|---|---|
| Brand blue used on dark because it is "the brand colour" | Derived token, commented, with a contrast assertion in the test suite |
| Bands recoloured into a blue ramp, losing at-a-glance meaning | Acceptance criterion requires five distinct hues, greyscale-legible |
| Font embedding bloats the export | Subset to Latin, two weights, assert bundle size in CI |
| Brand drift over time | Palette lives in one token file; no hex literals in components (already lint-enforced) |

## Open questions

1. **Is this first-party use?** The Trademark Guidelines govern third-party display of Chainlink
   marks. A tool built inside Chainlink measuring Chainlink's own docs is first-party and
   unremarkable; if this repository is personal or external, logo use needs checking before the
   dashboard is shared. It is currently published on a **public** GitHub Pages site, which makes
   this worth settling first.
2. **Should the published export carry the logo at all?** A branded artifact implies official
   standing. If these are internal working measurements, a wordmark-free build may be the safer
   default for anything leaving the team.

## References

- [chain.link/brand-assets](https://chain.link/brand-assets) — palette, typefaces, logo files
- [ui/src/theme/tokens.css](../../ui/src/theme/tokens.css) — the single palette source
- [ui/src/lib/bands.js](../../ui/src/lib/bands.js) — the five semantic bands
- [plans/product-platform/06-overview-product-scores.md](06-overview-product-scores.md) — the
  editorial structure this restyles
