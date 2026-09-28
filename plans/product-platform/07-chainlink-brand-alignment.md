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
| Logo | **out of scope** — colours and typography only |

**Scope: no logo, no wordmark.** Only the palette and typefaces are adopted. That removes the
trademark question entirely: a colour scheme and an OFL-licensed typeface carry no marks, so the
dashboard can be published anywhere without a usage review.

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

`#0847F7` on `#0E1119` is unusable for text or for a thin chart line. **Resolved by using brand
Light Blue `#DCEBFF` as the dark accent** — 15.61:1, and still a brand value rather than a colour
invented for the purpose. Asserted in `scripts/check-contrast.mjs`, which fails the build if dark
mode is ever set back to `#0847F7`.

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
self-contained file under a strict CSP and no external font can be fetched. That reasoning no
longer holds.

**Licence: SIL Open Font License 1.1** ([repository](https://github.com/localremotetw/TASA-Typeface-Collection)),
which explicitly permits embedding and redistribution in a bundle. Free, commercially usable, no
alternative needed. Also published on Google Fonts and
[Fontsource](https://fontsource.org/fonts/tasa-orbiter/install), so self-hosting is an npm install
rather than a manual asset hunt. Five weights, and a **variable font with a weight axis**.

Cost: a Latin-subset woff2 is typically 15–30KB, ~33% larger again as base64, against a 256KB
export. The variable font is the efficient choice here — one file covering every weight the UI
needs, instead of two or three static cuts.

Recommend **the variable font, Latin subset, base64-embedded**, with the system stack retained as
a fallback so the page stays readable if the face fails to decode. OFL requires the licence text
travel with the font; it goes in the repository beside the asset.

## Proposed solution

Keep the editorial structure from plan 6 — rules not boxes, figures as heroes, asymmetric columns.
Change the surface:

| layer | change |
|---|---|
| Typography | TASA Orbiter for display figures and headings; Inter for body and tables; monospace unchanged for identifiers |
| Accent | Chainlink Blue `#0847F7` in light mode; brand Light Blue `#DCEBFF` in dark, where the blue fails |
| Surfaces | Light Gray `#F5F7FA` is the light *page*, white panels sit above it; Dark `#0E1119` is the dark base |
| Light Blue | `#DCEBFF` as the dark accent and the light theme's scale track |
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
- [x] Export bundle: **360KB**, 164KB gzipped. The 320KB figure in the first draft assumed one
      embedded face; carrying both TASA Orbiter and Inter costs ~104KB base64. Recorded as the
      real number rather than quietly moving the ceiling — over the wire it is 164KB, and the
      alternative was dropping a brand typeface
- [ ] No Chainlink logo or wordmark appears anywhere — palette and typography only
- [ ] The OFL licence text ships alongside the embedded font
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

## Resolved

Both questions the first draft raised are closed by the no-logo scope. Without marks there is
nothing for the Trademark Guidelines to govern, and the artifact cannot be mistaken for an official
Chainlink publication — which is the right outcome for a set of internal working measurements that
is currently served from a public URL.

## References

- [chain.link/brand-assets](https://chain.link/brand-assets) — palette and typefaces
- [TASA Typeface Collection](https://github.com/localremotetw/TASA-Typeface-Collection) — OFL 1.1 source
- [Fontsource: TASA Orbiter](https://fontsource.org/fonts/tasa-orbiter/install) — self-hosting packages
- [ui/src/theme/tokens.css](../../ui/src/theme/tokens.css) — the single palette source
- [ui/src/lib/bands.js](../../ui/src/lib/bands.js) — the five semantic bands
- [plans/product-platform/06-overview-product-scores.md](06-overview-product-scores.md) — the
  editorial structure this restyles
