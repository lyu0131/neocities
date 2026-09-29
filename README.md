# neocities

Personal websites by **Sylas Lyu**, built for [Neocities](https://neocities.org).

Every site is plain HTML, CSS and vanilla JavaScript: no framework, no build step, and relative paths only, so each folder works on its own.

## The sites

| folder | what it is |
|---|---|
| [`site0/`](site0/) | The first one: a minimal Helvetica portfolio. |
| [`site2/`](site2/) | **The light table.** Draggable xerox prints, a ransom-note title and photocopy-on-click. Its Work page holds the real portfolio. |
| [`site2-old/`](site2-old/) | Version 1 of site2 (a tidy grid), kept for reference. |
| [`site3/`](site3/) | **DOLOR/SIT.** Brutal CCTV, xerox and poster-wall style. |
| [`site4/`](site4/) | **BUNNyS.** A mobile-suit cockpit: a 360° city you can look around, a mecha HUD, and lock-on contacts that open the Pilot, Missions and Hangar pages. Still in progress. |

Each site has a `DESIGN.md`, the contract its pages, styles and scripts follow. Read it before changing that site.

## Viewing a site locally

- **site0, site2, site3:** open the folder's `index.html` in a browser.
- **site4:** serve the folder over http instead, for example with VS Code's *Live Server* extension (right-click `site4/index.html` → *Open with Live Server*). It works from `file://` too, but a local server is closer to how Neocities serves it.

## Deploying

Upload the contents of one site folder to Neocities. Nothing needs compiling.

## site4 tests

site4 has a headless-browser test suite in `site4/tests/`. It needs [Node](https://nodejs.org) 22+ and Chrome or Edge:

```sh
node site4/tests/run.js
```

Screenshots land in `site4/tests/out/`, which git ignores.

## Artwork

All artwork is original. site4's suit, the RX-124 TR-6 [WOUNDWORT], is the author's own design.
