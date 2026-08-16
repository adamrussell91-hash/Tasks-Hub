# Hub Design Kit — agent rules

This kit is the visual source of truth for Adam’s hubs (Teaching, Life, Knowledge, Tasks).

## Before any hub UI work

1. Use **closed tokens** from `tokens/tokens.css`. Do not invent colours, type sizes, radii, or shadows.
2. Load **tokens → overlays → chrome** in that order.
3. Start new pages from `snippets/shell.html`.
4. Set `html[data-hub="teaching|life|knowledge|tasks"]`. The only intentional per-hub visual difference is glass/tile density via `overlays/hub-density.css`.

## Do not

- Reinvent the navy rail, cotton/paper canvas, button system, or page header patterns.
- Add purple-on-white themes, cream+terracotta defaults, or dark-mode canvas.
- Use cards in the hero; prefer glass panels only where hierarchy needs them.

## Sync

After editing this kit, run `scripts/sync-to-hubs.sh` (when wired) to push into each hub repo’s `design-kit/` copy.

## Origin note

Canonical kit historically lived outside GitHub. This copy is seeded from Teaching Hub Cotton Glass tokens + chrome so Tasks Hub can ship as a sibling. Prefer replacing with the full kit from Documents when available.
