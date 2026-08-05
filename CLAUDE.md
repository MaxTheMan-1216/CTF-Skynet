# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Terminator/Skynet-themed CTF site, currently a scaffold: node count, routes, puzzle content and flag validation are all placeholders (see the footer note in console.html). Pure static HTML/CSS/JS — no framework, no dependencies, no build step, no tests.

## Running it

Any static file server works, e.g.:

```bash
python -m http.server 8000
```

Opening the files directly (file://) also works. To skip the landing gate during development, open console.html directly; the gate's access phrase is `no fate` (`ACCESS_PHRASE` in index.html).

## Architecture

Two pages, each with its own CSS/JS file, sharing one token stylesheet and a `scripts/`/`styles/` split:

- **index.html** + **styles/gate.css** + **scripts/gate.js** — landing gate. Boot animation plus an access-phrase form; the correct phrase redirects to console.html. The check is client-side only and is an extension point for a future real puzzle.
- **console.html** + **styles/console.css** + **scripts/console.js** — the "infiltration console" (nodes page). The map background is an inline SVG skull (`#skull-art`, viewBox `1600×1557`, traced centerline `<path>` strokes with a `stroke-dashoffset` draw-on reveal) — this is the confirmed final visual direction, not a placeholder; don't replace or "simplify" it. Game nodes render as `#ball-<id>` groups positioned directly in that same 1600×1557 coordinate space (see the `MAP_W`/`MAP_H` constants and the `NODES` array at the top of `scripts/console.js`), plus a mobile step-list fallback (<640px) and a briefing panel. A node's `status` (`cleared`/`current`/`locked`/`bonus`) drives styling, interactivity, and briefing content. `BONUS_ROUTES` (id pairs) draws the one dashed optional-branch line; there's no general `ROUTES` array — connectivity between the main nodes reads from the skull artwork's own line-art, not from drawn edges.
- **styles/theme.css** — design tokens (CSS custom properties: `--void`, `--signal`, `--phosphor`, …) and two fonts embedded as base64 data URIs. **Do not read this file whole** — it is almost entirely font data; the tokens are in the final ~25 lines (grep for `:root`).
- The inline skull SVG markup itself stays directly in `console.html` (not pulled into its own file) — CSS/JS reference it by id (`#skull-art`, `#ball-<id>`) and it needs to be real DOM, not a fetched asset. Pulling it out would also break `file://` (no-server) usage, see below.

## Conventions the pages follow

- Each page's CSS lives in `styles/<page>.css`, JS in `scripts/<page>.js`, loaded via `<link rel="stylesheet">` / `<script src>` at the same point in the markup the inline block used to occupy (so load-order/timing is unchanged from when they were inline). Only shared tokens/fonts live in `theme.css`. Files start at `<title>` with no doctype/html/head/body wrappers — match that style. The one exception is the skull SVG markup in `console.html`, which stays inline (see Architecture above).
- Audio and entry animations are gated behind the first click/keypress (browser autoplay policy). Both pages use a run-once flag plus a `.play` class that the CSS animation blocks key off.
- Every animation has a `prefers-reduced-motion` story: entry/looping animations live inside `no-preference` media blocks so reduced-motion users get the final state immediately (nothing is left at `opacity: 0` waiting on an animation that never runs).
- Staggered reveals use a per-item `--i` custom property set from JS, consumed by `animation-delay: calc(var(--i) * Xms)`.
- Colors always come from the theme tokens: `--signal` (red) is the accent/danger color, `--cleared` the green for done states.
