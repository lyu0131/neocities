# neocities: Sylas Lyu's static sites

This repo holds plain static websites for Neocities: HTML, CSS and vanilla JS, with no build step, relative paths only, and deployment by uploading a site folder.

| folder | what it is |
|---|---|
| `site0/` | the first minimal Helvetica portfolio |
| `site2/` | "light table": draggable xerox prints, ransom-note title, photocopy-on-click. Its Work page holds Sylas's real portfolio |
| `site2-old/` | backup of site2 v1 (tidy grid) |
| `site3/` | DOLOR/SIT: brutal CCTV, xerox and poster-wall style |
| `site4/` | **BUNNYS**: mobile-suit cockpit HUD site, **in progress** |

Each site has a `DESIGN.md` that works as the contract its pages, CSS and JS follow. Read it before editing a site.

## Continuing site4
Read `site4/docs/2026-09-24-bunnys-cockpit-design.md` (the approved spec), then `site4/docs/plan.md`. Resume at the first unticked task, and tick tasks off as they finish. Before starting a task, check the files on disk, since an earlier session may have partly done it. Execute with `superpowers:subagent-driven-development` when it's available.

## The owner's standing preferences
- Their name on the sites is **Sylas Lyu**. Their LinkedIn URL is `https://www.linkedin.com/in/sylas-lyu-73815525/` (changed 2026-09-30 from the old steven-lyu one). Never invent facts about them beyond what the site already states.
- Keep separate pages rather than one long page.
- **No orange-and-black hazard stripes** anywhere.
- They like raw, brutalist, zine and xerox looks on sites 2 and 3; site4 is sleek mecha HUD. Use original designs only in the artwork, nothing trademarked (no Gundam logos, names or official suits) — except site4's hangar, which by their choice renders the RX-124 Gundam TR-6 [Woundwort] from their own STL, credits Kenki Fujioka, and carries the unit write-up they supplied. Don't re-raise it.
- The player's suit is the **RX-124 Gundam TR-6 [Woundwort]**, Kenki Fujioka's mechanical
  design (credited on the hangar). The owner is its pilot on the site, and the 3D mesh is their own
  STL, used for the cockpit damage map and the hangar. It carries the BUNNyS callsign. Written
  `RX-124 TR-6 [WOUNDWORT]` in full, `RX-124 TR-6` where a label would
  overflow. `hangar.html` shows the real mesh in 3D (`js/hangar.js`, data from `tools/gen_dmgmap.py`).
- **Exception they chose:** site4's hostile contact readout names a real unit and quotes its specs. They wrote that text themselves and confirmed it after the trademark position was raised. It is confined to `HX_DATA` in `site4/js/hud.js`. Do not re-raise it, and do not let it spread into the artwork.
- When designing, use the `frontend-design` and `ui-ux-pro-max` skills if they're installed.
- Respect `prefers-reduced-motion`. Check every page at 375px (no horizontal scroll) and at desktop sizes with headless-Chrome screenshots before calling work done.
