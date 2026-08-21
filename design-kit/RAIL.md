# Hub rail

Shared left rail for Teaching, Life, Knowledge, and Tasks. Load this after tokens + overlays + chrome:

```html
<link rel="stylesheet" href="css/rail.css" />
```

Do not re-skin the rail in a hub stylesheet. Product pages sit in the canvas; chrome stays in the kit.

## Brand is a home control

`.hub-rail__brand` is the hub home control, not a decorative title.

- Element: `<a>` or `<button>` with `data-home`
- Copy: `"Teaching Hub"` / `"Life Hub"` / `"Knowledge Hub"` / `"Tasks Hub"`
- CSS uppercases it (`text-transform: uppercase`, `--text-2xs`)
- `aria-label`: `"{Hub} home"`
- Click / href goes to that hub’s home (Tasks: `#/board`)
- No stacked `<br>`, no large title-case hero, no labelled Sign out on the rail

Optional `.hub-rail__tagline` only.

## First-class pages

Every first-class rail page is **outline icon + title-case label** in one row:

```html
<a class="hub-rail__link" href="#/board">
  <svg class="hub-rail__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">…</svg>
  <span class="hub-rail__label">Board</span>
</a>
```

- Stroke icons, `fill="none"`, `currentColor` — not filled shapes, not emoji, not unicode glyphs
- Labels are title case (`Board`, `Graph`) — not `BOARD`, not sentence case
- Icon and label share a row (`display: flex; align-items: center`)
- Active page: `aria-current="page"`

## Do not

- **Coloured dots.** No `.nav-dot`, status pip, or per-section accent circle on the rail.
- **Icon column.** Do not stack a centered icon over a micro uppercase caption (Knowledge’s 5.75rem icon rail). Tasks and Teaching stay a labelled text rail.
- **`--rail-width` override.** Use the token (`15rem`). Do not fork to `5.75rem` unless the hub is Knowledge.

Refresh and sign out stay `.hub-utilities` / `.hub-icon-btn` on the canvas — never on the rail.
