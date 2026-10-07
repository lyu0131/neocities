# Field manual library: design

Approved in chat 2026-10-07. Site4 holds one field manual today; the owner will add many more. This turns the
single manual into a library that grows by one Markdown file and one command per manual.

## Intent
- Said: many more field manuals are coming; FIELD MANUAL stays a cockpit contact; Claude makes the calls.
- Assumed: each manual arrives as one long Markdown guide with numbered `## N. Title` sections, written for
  anyone (nothing personal: no courses, research projects, own skills or plugins, chat references).
- Done when: the cockpit's FIELD MANUAL opens a library of every manual, adding one is a file plus a command,
  and the current guide's PDF links (`manual-N.html#c-K`) still land on the right code block.

## Files
| Path | What it is |
| --- | --- |
| `docs/manuals/<slug>.md` | One manual's source. `<slug>`: lowercase letters, digits, hyphens. The current guide moves here as `claude.md` |
| `manual.html` | The library (generated) |
| `manual-<slug>.html` | A manual's index page (generated) |
| `manual-<slug>-<n>.html` | Its parts, n from 1 (generated) |
| `manual-1.html` .. `manual-6.html` | Redirect stubs for the old URLs (generated, see Redirects) |
| `tools/gen_manual.py` | Builds all of the above. No arguments: `python tools/gen_manual.py` from `site4/` |

Flat files in `site4/`, not a folder per manual: pages in a subfolder would need `../` paths and changes to how
link.js and pagehud.js name the current page and load the emblem. Visitors never see the difference.

## Source header
Each source starts with a front-matter block the generator reads (YAML-style `key: value`, parsed by hand,
no new dependency):

```
---
title: Claude agents, tools and workflow
blurb: A Windows-first guide to Claude's agents, MCP, skills, hooks and plugins.
revision: B
date: 2026-10-07
parts:
  - Concepts | What the pieces are and how they fit together. | 2-3
  - Foundations | Terminal and JSON basics. | 4-5
---
```

- `title`, `blurb`, `date` required; `revision` defaults to A.
- `parts` optional. Each line: title | blurb | section range. Section 1 (and any section not in a part) goes on
  the manual's index page. Without `parts`, every section after 1 is its own page.
- The nav label for a part is P1, P2 ...; a final part titled Sources is labelled SRC, as now.
- Section ladder labels come from each `## N. Title` heading, shortened to its first three words when longer
  (replaces the hand-written SHORT table).
- A bad header (missing field, a section in two parts, a range naming a section that doesn't exist) stops
  the build with a message naming the file and the problem. Nothing is written for any manual in that case.

## Library page (`manual.html`)
- Same sub-page shell as the manuals (strip, HUD ladder and scope, big-screen zoom, `--brg: 104`).
- h1 FIELD MANUALS, then one panel per manual, newest `date` first, coded FM-01, FM-02 ... by date, oldest
  first (ties broken by slug), so a manual keeps its code as newer ones arrive.
- Each panel: code, title, blurb, then a stats row (parts, sections, exercises, revision and date), and a link
  "Open <title>" to `manual-<slug>.html`.
- The HUD ladder has a rung per panel, so a long library is still navigable by J/K.

## Inside a manual
- Strip: `◂ ALL MANUALS` (to `manual.html`), then INDEX, P1 ... SRC for that manual. Esc returns to the cockpit as
  on every sub-page.
- Everything the current pages do carries over: code blocks with ids `c-1..c-N` in that manual's order, COPY,
  tables, exercises, recipes, cautions, best practice, Expected, Tested/Unverified tags, bold lead-ins,
  cross-reference links (sections, exercises, recipes resolve within the same manual only).
- The index page's intro text that names the current guide's section 19 is moved into that guide's Markdown,
  so the generator holds no guide-specific prose.

## Redirects
The current guide's PDF links `manual-N.html#c-K`. For each old file `manual-1.html` .. `manual-6.html` the
generator writes a stub that sends the visitor to the matching `manual-claude-<n>.html`, keeping the `#c-K`
fragment (`location.replace(target + location.hash)`, with a plain link as the no-script fallback). Code-block
numbering in the current guide must not change, so the PDF's `c-K` ids stay valid; the build checks the count
(73) for `claude` and fails if it moves without the stubs being updated. The old `manual.html` becomes the
library, so the PDF's link to the guide's front page lands on the library, one click from the guide.

## Cockpit and HUD
- index.html's FIELD MANUAL target: readout `LIBRARY / RNG 0.2 KM`, info `FIELD MANUALS`, brief describing the
  library, so it never needs editing when a manual is added.
- pagehud.js: any page named `manual` or `manual-*` reads as the FIELD MANUAL contact (today it strips `-N`).
- link.js and boot.js already match `manual`; check they still do for `manual-<slug>-<n>`.

## Content rule
Manuals are general guides. Before a new one goes in: no personal details, no names of the owner's courses,
research, own skills, plugins or accounts, no references to the chat it came from. The copy goes through the
humanizer. A short "Adding a field manual" section in the repo's CLAUDE.md states the steps and this rule.

## Testing
`tests/manual.test.js` finds every generated manual page instead of expecting seven:
- no sideways scroll at 375/768/1366/1920, one h1, a ladder rung per panel, no JS errors (as now, per page);
- every in-page and cross-page link and fragment resolves;
- the library lists exactly the manuals in `docs/manuals/`;
- each redirect stub lands on the right page with its fragment intact;
- COPY copies exact text (one block per manual).
The full suite (`node tests/run.js`) passes, and pages are checked by screenshot at 375, 1920 and 2560.

## Out of scope
Search, tags and categories on the library (worth it at about ten manuals); per-manual PDFs; cross-links between
manuals.
