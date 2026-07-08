# Branding & Design System

## Positioning

**Location:** Downtown Cincinnati, Ohio, near Over-the-Rhine.

A boutique hotel blending Cincinnati's historic brick-and-ironwork character
with modern comfort. Warm, local, quietly upscale — not corporate, not
hipster.

**Target guests:** business travelers who want personality over chain
sameness, weekend couples exploring OTR's food scene, and event visitors
(FC Cincinnati games, music festivals).

**Brand personality:** welcoming, rooted, refined — "a well-traveled friend
who grew up here."

**Tagline (in use):** "Stay where the city began."
**Alternate:** "Cincinnati, made comfortable."

## Typography

| Use | Font |
|---|---|
| Headings | Playfair Display |
| Body | Source Sans 3 |

Loaded via Google Fonts in `frontend/index.html`. CSS variables:
`--font-heading`, `--font-body` (see `frontend/src/index.css`).

On the admin side, Playfair Display is used **only** for the sidebar logo
wordmark — everything else in the admin UI uses the body font.

## Guest-facing palette

| Name | Hex | Usage |
|---|---|---|
| Brick red | `#8C3B2E` | Primary brand color — logo, nav highlights, key CTAs |
| River blue | `#2E4A5B` | Headings, footer, body text on light backgrounds |
| Warm cream | `#F2EAD9` | Page backgrounds and cards instead of plain white |
| Rookwood clay | `#B5793B` | Secondary buttons, hover states, dividers |
| Sage | `#7A8B6F` | Small details — icons, tags, success states |

CSS variables: `--color-brick`, `--color-river-blue`, `--color-cream`,
`--color-clay`, `--color-sage` (`frontend/src/index.css`).

## Admin palette

| Name | Hex | Usage |
|---|---|---|
| Slate | `#232A31` | Sidebar/nav background — visually distinct from the guest site |
| Light gray | `#F4F5F6` | Page background |
| White | `#FFFFFF` | Cards, tables |
| Brick | `#8C3B2E` | Single accent — primary buttons, active nav item, links |
| Primary text | `#2B2F33` | |
| Muted/secondary text | `#6B7280` | Labels, helper text |
| Success | `#2F9E44` | e.g. confirmed booking status |
| Pending | `#D99A1B` | e.g. pending booking status |
| Danger | `#C0392B` | e.g. cancelled/failed booking status |

CSS variables: `--admin-slate`, `--admin-bg`, `--admin-white`,
`--admin-brick`, `--admin-text`, `--admin-muted`, `--admin-success`,
`--admin-pending`, `--admin-danger` (`frontend/src/index.css`).

The success/pending/danger colors are intended for status badges (e.g.
booking state) — use them consistently wherever booking status appears in
the admin UI.
