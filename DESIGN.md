# DESIGN.md — Moravec interface rules

Design system contract for anyone (human or agent) writing UI in
`apps/frontend`. Every rule here is extracted from shipped code — when a
rule and the code disagree, the code wins and this file is stale (fix it).

**Sources of truth:** `app/globals.css` (`@theme` tokens), `src/styles.ts`
(shared class strings), `app/layout.tsx` (page frame), `src/formatTime.ts`
(time formats). Existing components are the reference implementations.

## Product feel

- Research-grade mental-math trainer: calm, focused, one task at a time.
- Palette is pixel-picked from the original Moravec app: pink (`accent`)
  as primary, teal as the secondary "go forward" color.
- Restraint over decoration: no gradients, no shadows beyond what exists,
  no decorative animation.

## Layout

- **One card, one task.** Every screen is the `panel` class from
  `styles.ts`: `bg-panel border-subtle rounded-2xl w-full max-w-[480px]`.
  Callers add only padding and gap (`p-6 gap-4` is typical). Never widen
  a screen individually — the fixed max-width is what keeps the page from
  shifting sideways during navigation.
- Page frame (`layout.tsx`): top-aligned centered column; padding is
  longhand `pt-/pb-/pl-/pr-` per side so each folds in its
  `env(safe-area-inset-*)`. Never use `p-`/`px-`/`py-` shorthands on the
  page frame. The body is a flex column: `<main>` (the panel) then
  `SiteCredit`, which takes `mt-auto` and a 12px (`0.75rem`) bottom
  padding — it sits at the screen's bottom on short pages
  and follows the panel on tall ones. Nothing in the frame is `fixed`
  except the `SyncChip` pill.
- `bg-base` is the _recessed_ surface inside a panel (input wells, table
  rows, calculator keys). `bg-panel-accent` marks a panel surface asking
  for attention (unplayed level, hint card). Those are the only surfaces.
- **Never scroll horizontally inside a panel.** Pitfall: `overflow-y-auto`
  makes `overflow-x` compute to `auto`, so a y-scroller can sprout an
  x-scrollbar — add `overflow-x-hidden`. Make every scroller `relative`
  too: otherwise absolute descendants (e.g. `sr-only` labels) escape its
  clip and stretch the page's scroll height. Fluid grid/flex columns must be
  `minmax(0,1fr)`/`min-w-0` and long text `truncate`d. Verify the ~320px
  phone case; the 480px panel shrinks to it.

## Color

- Every color comes from `@theme` in `globals.css` → `bg-*/text-*/
border-*/ring-*` utilities. **No raw hex, no new tokens** without a
  role-based name and a comment.
- Surfaces: `base` (page), `panel` (card), `panel-accent` (calling for
  attention). Borders: `subtle`, `subtle-accent`, `subtle-muted`.
- Text scale of emphasis: `foreground` → `muted` → `muted-2` →
  `disabled`. Pick the lowest emphasis that reads correctly.
- `accent` (pink) is for interactive fills and large emphasis; for small
  accent-colored text use `accent-text` (darker — clears contrast).
- `teal` = the "move forward" action and correct-result color (Play next,
  `success` buttons). `teal`/`warning` deliberately fail AA as text —
  a documented brand-over-compliance call (issue #20); use them for color
  coding, not sole information carriers.
- Semantic pairs: `success`/`success-bg`/`success-solid`,
  `danger`/`danger-bg`/`danger-border` for correctness states.
- For computed colors (e.g. heatmap alpha), reference the variables
  inline — `style={{ backgroundColor: "var(--color-teal)" }}` — still no
  raw hex (see `EffBar`/`CategoryStatsDetail`).

## Type

- `font-sans` (Gotham) is the default interface face. `font-mono` (Overpass
  Mono) is for every number, math expression, and time.
- Headings: `text-xl`/`text-2xl font-bold tracking-tight`.
- Buttons (`button()`, keypad, Submit) and level-row labels: `font-medium`
  (Gotham Medium, 500).
- The only non-default size is `text-2xs` (0.625rem) for badge-sized
  labels; no other arbitrary sizes.
- Section labels: `text-2xs text-muted-2 uppercase tracking-wider`.
- Copy: sentence case, every user-facing string through `next-intl`
  (`messages/en` + `messages/es`, kept in sync). No hardcoded strings.
- Time formats (`formatTime.ts`): `formatSeconds` → `"4.2s"` for
  per-trial/stat tables; `formatDuration` → `"00:55:503"` for level
  records. Don't mix them — the record format overflows narrow columns.

## Components — reach for `styles.ts` before inventing

- `button()`: `primary` (accent fill), `success` (teal fill — the
  move-forward action, not a semantic green), `outline` (pink outline,
  lower priority), `ghost` (muted text).
- `linkButton()`: same variants for `<Link>` used as a CTA (bakes in
  `text-center block`).
- `backLink`: a lucide `ArrowLeft` (20px) with a 44px pseudo-element touch target.
- `textLink`, `navLink`, `hintButton` for their named roles.
- Row patterns: dense `py-0.5`/`py-1` rows, `hover:bg-base` on
  interactive/scrollable rows.
- Thin progress bars: 6px track `bg-subtle` (the bars sit inside `bg-base`
  rows — see `EffBar`), fill colored by meaning.
- Icons: `lucide-react` only, `aria-hidden="true"` (the control carries the
  label), colored via `currentColor`; filled shapes (stars) pass
  `fill="currentColor"`.

## Motion

- One entrance: `animate-fade-in` (180ms ease-out translate+scale) —
  stagger siblings via `animationDelay` ~50–100ms steps plus
  `animationFillMode: "backwards"` (FinishedScreen is the reference).
- Micro-interaction: `active:scale-96` + `transition duration-150` on
  buttons; `touch-manipulation` on every interactive element.
- `prefers-reduced-motion` → opacity-only (baked into the utility).
- Never ease-in entrances, nothing over ~300ms, nothing that loops or
  bounces, no new keyframes.

## Interaction & accessibility

- Navigation is a real `<Link>` (Cmd-click works); state changes are real
  `<button>`s (keyboard + screen reader). Regression-pinned in tests.
- Toggles carry `aria-pressed`/`aria-expanded`; icon-only controls get
  `aria-label`; scrollable regions get a labeled `role` (e.g. `img` on the
  heatmap, `table`/`row`/`cell` on grid-laid lists).
- Touch targets ≥44px — use the `backLink` pseudo-element trick for
  icon-size controls.
- Existing keyboard chords (Enter submit; N/R/M on FinishedScreen) must
  keep working.

## Anti-patterns

- Raw hex or `rgba()` in components; new color/size tokens without a
  role-named theme entry and comment.
- Fixed pixel widths assuming desktop; anything that can x-overflow a
  panel; `overflow-y` scrollers without `overflow-x-hidden`.
- `visible` characters or layouts that only appear on `hover` (touch has
  no hover).
- Title case in copy; hardcoded en/es strings; hardcoded numbers for
  domain constants (use `engine` exports).
- New border radii (the scale is `rounded-lg`/`rounded-xl`/`rounded-2xl`)
  or new shadows.
- Unicode glyphs or emoji as UI icons (arrows, ⌫, stars, 🔒, 🎉) — use a
  lucide icon. Math symbols in content (×, ², −) are text, not icons.
