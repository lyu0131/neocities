# The library as a bookshelf: design

Approved with the owner on 2026-10-08 through mockups (`.superpowers/brainstorm/`): the display shelf, and "pull the
book out" with its animation. Replaces the library's list of panels (`manual.html`); the manuals themselves don't change.

## Intent
- Said: the field manual library should feel like an actual library. Chosen: a display shelf, the newest manual
  face-out and the rest as spines; clicking a spine pulls that book out onto the display, animated.
- Assumed: more manuals will come, across a few subjects; the owner keeps writing them as Markdown with a header.
- Done when: `manual.html` shows a display shelf and one shelf per subject, every manual is a spine, a click (or Enter)
  brings it face-out with its blurb, parts and Open link, and nothing is lost without JavaScript or with reduced motion.

## The page
Inside the usual sub-page shell (strip, HUD ladder and scope, big-screen zoom, text size):
- `p.bar` LIBRARY · SYLAS LYU · FIELD MANUALS, h1 FIELD MANUALS, the blurb, the rail (VOLUMES, EXERCISES) as now.
- **On display** (`section.panel.fm-display`, data-sector "On display"): a cover and an info column.
  - Cover: FM code, title, "N PARTS · N EXERCISES" (exercises left out when 0). A framed plate like the mockup.
  - Info: subject, blurb, the parts as a list of links (each part's page), revision and date, and `a.fm-open` "Open FM-NN".
  - `aria-live="polite"` on the info column, so a screen reader hears the new book.
- **One shelf per subject** (`section.panel.fm-shelf`, data-sector = the subject), subjects A to Z, a label line, the
  spines in FM order on a ledge.
- Below 600px: the cover sits above the info; spines wrap onto more rows.

## Spines
- Each is `a.fm-spine` with `href` = the manual's front page, so with no JavaScript every spine goes straight in.
- Text: the header's `spine:` if given, else the title, set vertically (`writing-mode: vertical-rl`, turned 180deg).
- Height: 120px + 6px per section, capped at 200px. Width: 30px + 3px per part, capped at 52px. So length shows.
- The book on display leaves a gap: its spine gets `.is-out`, drawn as an empty slot (a dashed outline, no text
  colour) but still focusable, with `aria-current="true"`.

## Header fields (gen_manual.py)
- `subject:` optional, default `General`. `spine:` optional, default the title.
- `claude.md` gets `subject: AI tools`.

## Behaviour (js/library.js, new, only on manual.html)
- On load the display shows the book named by the address (`manual.html#fm-03`), else the newest (highest date, as
  FM numbers are assigned oldest first). The generator renders the newest into the HTML, so it's right without JS too.
- Click or Enter on a spine: preventDefault, pull that book out, `history.replaceState` to `#fm-NN`. Clicking the spine
  of the book already shown does nothing.
- The pull-out, as approved: the old cover tilts back and fades (320ms), a copy of the spine lifts 26px and travels to the
  display spot (560ms), then the new cover turns to face (rotateY 80deg to 0, 380ms) and the info fades in (300ms).
  Web Animations API, no library. A click during a pull is ignored.
- Reduced motion: the books swap in place, no movement.
- Data: the generator writes one `<template id="tpl-fm-NN">` per manual holding its cover and info markup;
  library.js clones the right one into the display.

## Not changing
The manual pages, Ctrl+K and `js/site-index.js`, the strip dropdown, link previews (the library's picture is retaken
with `node tools/gen_og.js`), redirect stubs.

## Testing (tests/manual.test.js)
- The library has one spine per source, each linking its manual; one shelf per subject, in A-Z order.
- On load the newest manual is on display; `manual.html#fm-01` shows FM-01.
- Clicking a spine (and Enter on a focused spine) puts that book on display and sets the hash; its spine is `.is-out`.
- With reduced motion the swap is immediate (no running animations after the click).
- With JavaScript blocked from running (no library.js), every spine still links its manual and the newest is on display.
- No sideways scroll at 375/768/1366/1920; no JS errors. Screenshots at 375, 1920 and 2560 checked by eye.
- A self-check case: a header with `subject:` and `spine:` parses, and both default when absent.

## Out of scope
Search inside the library (Ctrl+K covers it), sorting controls, reading progress per book, more than one display slot.
