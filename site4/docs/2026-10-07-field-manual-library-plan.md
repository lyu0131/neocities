# Field Manual Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn site4's single field manual into a library that grows by one Markdown file and one command, with GSAP motion on the manual pages.

**Architecture:** `tools/gen_manual.py` stops being a one-guide script: it reads every `docs/manuals/*.md`, validates all headers first, then writes each manual's flat pages (`manual-<slug>*.html`), the library (`manual.html`) and redirect stubs. A new `js/manual-fx.js` adds one-shot GSAP effects on those pages only.

**Tech Stack:** Python 3.11 (markdown-it-py, pygments, beautifulsoup4), vanilla JS, GSAP 3.13.0 vendored in `js/vendor/`, Node + headless Chrome tests (`tests/cdp.js`).

**Spec:** `site4/docs/2026-10-07-field-manual-library-design.md`

## Global Constraints
- Static site, no build step for visitors, relative paths only, everything under `site4/`.
- Generated pages are never hand-edited; change the generator or the Markdown and regenerate.
- Slugs: `^[a-z][a-z0-9-]*$` (a leading letter, so `manual-<slug>.html` never collides with a stub `manual-<n>.html`).
- The current guide keeps exactly 73 code blocks in the same order (its PDF links `manual-N.html#c-K`).
- Manuals are general guides: nothing about the owner's courses, research, own skills, plugins or accounts.
- No orange-and-black hazard stripes. `prefers-reduced-motion` turns all GSAP motion off.
- Every page: no sideways scroll at 375/768/1366/1920, no JS errors. Screenshots at 375, 1920 and 2560 before calling it done.
- GSAP and plugins load only on `manual.html` and `manual-*.html`.

## Review Focus
1. A header typo (missing `title`, `parts` range naming section 99, a section in two parts) must stop the build naming the file, and leave the existing pages untouched. Pinned in Task 1.
2. A manual with no `parts` and no exercises (plain Markdown dropped in) must still build: index page plus one page per section, no empty Exercises panel. Pinned in Task 1 and Task 2.
3. Old PDF link `manual-4.html#c-12` must land on `manual-claude-4.html#c-12`, not the library. Pinned in Task 2.
4. With GSAP blocked or failing, no heading or panel may stay hidden. Pinned in Task 4.
5. At 2560x1440 (`--z: 1.4`) the scroll triggers must still fire for the last section on a page. Pinned in Task 4.

---

### Task 1: Header parsing and per-manual layout (pure functions + self-check)

**Files:**
- Modify: `site4/tools/gen_manual.py` (top of file: new functions; module-level guide state stays until Task 2)
- Create: `site4/tools/test_gen_manual.py`

**Interfaces:**
- Produces:
  - `parse_header(text: str, name: str) -> tuple[dict, str]`: splits a leading `---` block from the body. Returns `meta` with keys `title`, `blurb`, `date` (str `YYYY-MM-DD`), `revision` (default `"A"`), `platform` (optional, default `None`), `code_blocks` (optional int), `legacy` (optional str, an old file prefix such as `manual`), `parts` (list of `(title, blurb, [section ints])`, default `[]`). Raises `ValueError(f"{name}: <problem>")` on a missing required field or malformed part line. Part line format: `  - Title | Blurb | 2-3` (range `a-b` or single `n`).
  - `split_sections(body: str, name: str) -> dict[int, tuple[str, str]]`: `## N. Title` splitting (the existing regex), raises `ValueError` if none found.
  - `layout(meta: dict, sections: dict, name: str) -> list[dict]`: the page list for one manual, each `dict(slug_n, nav, title, kicker, h1, blurb, sections)`, where `slug_n` is `0` for the index and `1..` for parts. Index takes section 1 and every section in no part. Parts: nav `P1..`, a part titled `Sources` gets nav `SRC`. With no `parts`, each section after 1 becomes its own part titled by its heading. Raises `ValueError` for a section in two parts or a part naming a missing section.
  - `short(title: str) -> str`: first three words of a heading.

- [ ] **Step 1: Write `test_gen_manual.py`** (assert-based, run as `python tools/test_gen_manual.py`, imports `gen_manual` from its own folder; Step 3 puts the existing build under `if __name__ == "__main__":` so the import doesn't run it). Assertions:
  - a full header parses: `meta["title"] == "T"`, `meta["revision"] == "A"` when absent, `meta["parts"] == [("Concepts", "What.", [2, 3])]`;
  - missing `date` raises `ValueError` whose message starts with `"x.md:"`;
  - `layout` with parts `2-3` on sections `{1,2,3,4}` gives navs `["INDEX", "P1"]` and index sections `[1, 4]`;
  - a part titled `Sources` gets nav `SRC`;
  - no parts on sections `{1,2,3}` gives navs `["INDEX", "P1", "P2"]`, P1 titled by section 2's heading;
  - section 3 in two parts raises; a part `2-9` on sections `{1,2}` raises;
  - `short("Terminal and CLI basics on Windows") == "Terminal and CLI"`.
- [ ] **Step 2:** Run `python tools/test_gen_manual.py`. Expected: ImportError / NameError (functions missing).
- [ ] **Step 3:** Implement the four functions in `gen_manual.py`; wrap the existing module-level build in `if __name__ == "__main__":` (no other change to it yet). The header is parsed by hand (`key: value` lines, `parts:` followed by `  - ` lines); no YAML dependency.
- [ ] **Step 4:** Run `python tools/test_gen_manual.py` → prints `ok`. Run `python tools/gen_manual.py docs/field-manual.md .` → still `code blocks 73 exercises 25`, `git diff --stat -- '*.html'` empty.
- [ ] **Step 5:** Commit `site4: gen_manual parses manual headers and lays out parts (self-check)`.

### Task 2: Build every manual, the library and the redirect stubs

**Files:**
- Modify: `site4/tools/gen_manual.py` (replace the `__main__` build)
- Move: `site4/docs/field-manual.md` → `site4/docs/manuals/claude.md` (with `git mv`), add its header
- Modify: `site4/tests/manual.test.js`
- Modify: `site4/js/pagehud.js:29-30`, `site4/js/boot.js` (`fromInside` regex), `site4/index.html` (`#t-manual` data)
- Modify: `site4/DESIGN.md` (Field manual section), `CLAUDE.md` (new "Adding a field manual" section)
- Generated: `site4/manual.html`, `site4/manual-claude.html`, `site4/manual-claude-1..6.html`, stubs `site4/manual-1..6.html`

**Interfaces:**
- Consumes: Task 1's `parse_header`, `split_sections`, `layout`, `short`.
- Produces:
  - `build_manual(slug: str, meta: dict, sections: dict, vol: int) -> tuple[dict[str, str], dict]`: `{filename: html}` for the manual's pages, plus a summary `dict(slug, title, blurb, date, revision, vol, parts, sections, exercises, code)`. All of `render_section`, the `SEC_PAGE/EX_PAGE/REC_PAGE` maps, `counter` and `CODE_MAP` become locals of this call, so cross-references resolve within one manual. File names: index `manual-<slug>.html`, parts `manual-<slug>-<n>.html`.
  - `library(summaries: list[dict]) -> str`: `manual.html`.
  - `stub(target: str) -> str`: a redirect page.
  - CLI: `python tools/gen_manual.py` (no arguments, run from `site4/`). It parses and lays out every `docs/manuals/*.md` first; any `ValueError` prints the message and exits 1 before writing. A manual whose `code_blocks` is set and doesn't match also exits 1. Then it writes everything and prints one line per manual (`claude: 7 pages, 73 code blocks, 25 exercises`).

Page rules (beyond what the spec fixes):
- Volumes: `vol` assigned by `(date, slug)` ascending from 1; the library lists by date descending.
- Panel `data-ref`: `FM-{vol:02d}{n:02d} · REV {revision}`; bar unit `SYLAS LYU · FM-{vol:02d} · REV {revision}`.
- `<title>`: `{part title}, {manual title}, Sylas Lyu`; the manual index uses `{manual title}, Sylas Lyu`; the library `Field manuals, Sylas Lyu`.
- Strip: `◂ ALL MANUALS` to `manual.html` then the manual's INDEX/P1../SRC; the library's strip is `◂ RETURN TO COCKPIT` (as today) and no part list.
- Rail on a manual index: PARTS (count), EXERCISES (count, omitted if 0), PLATFORM (omitted if no `platform`), REVISION `{revision} · {date as 7 OCT 2026}`. On a part: PART, SECTIONS, PLATFORM, REVISION as today.
- Manual index panels: Contents (as today, minus the PDF sentence) and Exercises (only if any; intro sentence `Each exercise says what output to expect.`).
- Library: h1 `FIELD MANUALS`, blurb `General guides, each one complete on its own.`, then per manual a `section.panel.fm-vol` with `p.sub` `FM-01`, `h2` title, the blurb, a `ul.rail` of PARTS / EXERCISES / REVISION, and `a.fm-open` `Open {title}` → its index.
- Stubs: for a manual with `legacy: manual`, write `manual-<n>.html` for each part n: `<!doctype html>` with `<meta name="robots" content="noindex">`, `<script>location.replace('manual-claude-<n>.html' + location.hash)</script>`, and a visible link to the same target.
- `claude.md` header: `title: Claude agents, tools and workflow`, `blurb: A Windows-first guide to Claude's agents, MCP, skills, hooks and plugins.`, `revision: B`, `date: 2026-10-07`, `platform: Windows 11`, `code_blocks: 73`, `legacy: manual`, and the five current parts (Concepts 2-3, Foundations 4-5, claude.ai 6-8, Claude Code 9-15, Applying it 16-20, Sources 21) with today's blurbs. Add to its section 1 the two sentences the generator used to hard-code: "Section and exercise numbers match the PDF edition." and "The four-week plan in section 19 puts the exercises in order."
- pagehud.js: `var here = document.documentElement.dataset.page; if (/^manual/.test(here)) here = 'manual';`
- boot.js: `manual(?:-\d+)?` → `manual(?:-[a-z0-9-]+)?`.
- index.html `#t-manual`: `data-readout="LIBRARY / RNG 0.2 KM"`, `data-info="FIELD MANUALS"`, `data-brief="General guides to working with AI.|Each one complete on its own,|with exercises and copyable code."`. The targets-nav link text: `Field manual: library of guides`.

- [ ] **Step 1: Update `tests/manual.test.js`.** `PAGES` = files matching `/^manual(-[a-z][a-z0-9-]*(-\d+)?)?\.html$/` (stubs excluded). Keep every existing per-page check (drop `nav marks current page` for `manual.html`'s part list, keep it for manual pages). Add:
  - `library lists every source`: the `.fm-vol` count equals the `.md` count in `docs/manuals/`, and each links `manual-<slug>.html`;
  - `stub keeps the fragment`: goto `manual-4.html#c-12`, after 800 ms `location.pathname` ends `manual-claude-4.html` and `location.hash === '#c-12'`;
  - replace `hangar links the field manual` with `cockpit strip links the library` (on `pilot.html`, `a[href="manual.html"]` exists).
- [ ] **Step 2:** Add the Task 1 self-check cases for plain Markdown: a file with only `title/blurb/date` and sections 1-3 builds 3 pages and no Exercises panel (call `build_manual` directly; assert `'Exercises' not in pages['manual-x.html']`, `len(pages) == 3`).
- [ ] **Step 3:** Run `node tests/manual.test.js` and `python tools/test_gen_manual.py`. Expected: FAIL (no library, no stubs, `build_manual` missing).
- [ ] **Step 4:** Implement `build_manual`, `library`, `stub`, the no-argument CLI; `git mv` the source and add its header and the two sentences; delete the old `manual-1..6.html` content by regenerating (they become stubs). Apply the pagehud/boot/index.html changes.
- [ ] **Step 5:** Run `python tools/gen_manual.py` → `claude: 7 pages, 73 code blocks, 25 exercises`. Run `python tools/test_gen_manual.py` → `ok`. Run `node tests/run.js` → exit 0. Break `claude.md`'s header (delete `date`), run the generator: exits 1 naming `claude.md`, `git status` shows no page changed; restore.
- [ ] **Step 6:** Write the "Adding a field manual" section in `CLAUDE.md` (steps: put `<slug>.md` in `site4/docs/manuals/` with the header, run `python tools/gen_manual.py` from `site4/`, run `node tests/run.js`; the content rule from the spec) and update `DESIGN.md`'s Field manual section to describe the library, files and header.
- [ ] **Step 7:** Commit `site4: the field manual becomes a library -- one Markdown file per manual, old URLs redirect`.

### Task 3: Motion with GSAP

**Files:**
- Create: `site4/js/manual-fx.js`
- Modify: `site4/tools/gen_manual.py` (script tags, the library panels' frame SVG), `site4/css/manual.css`, `site4/js/manual.js` (COPY text)
- Modify: `site4/tests/manual.test.js`, `site4/DESIGN.md` (Motion line under Field manual)

**Interfaces:**
- Consumes: Task 2's markup: `.fm-vol`, `.screen h1`, `.panel > h2`, `.fm-loop svg path`, `.fm-code button.copy`.
- Produces: `html.fx` class while effects are armed; nothing global (`manual-fx.js` is an IIFE).

Effects (exact values):
- Library `.fm-vol`, on entering the view (ScrollTrigger `start: 'top 85%'`, `once: true`): its `svg.fm-frame rect` draws `drawSVG: '0%' → '100%'` over 0.5 s, then the h2 `scrambleText: { text: <original>, chars: '█▓▒░<>/\\|01', speed: 0.6 }` over 0.6 s, then `.fm-blurb, .rail` from `autoAlpha: 0, y: 8` over 0.3 s. The generator adds `<svg class="fm-frame" aria-hidden="true"><rect width="100%" height="100%"/></svg>` as the panel's first child (CSS: absolute, inset 0, no fill, `stroke: var(--hud)`, `pointer-events: none`).
- h1 on the library and every manual page: `SplitText` with `type: 'chars', aria: 'auto'`, chars from `autoAlpha: 0` with `stagger: 0.025`, 0.4 s, on load.
- Every `.panel > h2` inside a manual (not the library): ScrambleText once at `start: 'top 80%'`, 0.5 s, same chars.
- `.fm-loop svg path`: `drawSVG: '0%' → '100%'`, 0.8 s, stagger 0.15, once at `top 75%`.
- COPY: `manual.js` sets the button text to `TRANSMITTED` (was `COPIED`) and adds class `is-sent` for 1.2 s; CSS `.copy.is-sent` flashes the HUD green background once (`@keyframes fm-sent`, 0.6 s). Button `min-width` grows to fit (no layout shift on the code head).
- `.fm-vol:hover::after`: one scanline sweep, CSS only, 0.6 s, `@media (hover: hover)` and not under reduced motion.

- [ ] **Step 1: Tests in `manual.test.js`.**
  - `reduced motion shows full headings`: a second `launch({ reduce: true })`, on `manual.html` and `manual-claude-4.html`: `document.documentElement.classList.contains('fx') === false` and every `h1, .panel > h2` has `getComputedStyle(el).visibility === 'visible'` and opacity `1`.
  - `headings end as their source text`: normal run on `manual-claude-4.html` at 2560x1440, scroll to the bottom in steps of `innerHeight` with 300 ms waits, wait 1500 ms; each `.panel > h2` `textContent` equals its `data-text` attribute (the generator writes `data-text` with the heading's text) and is visible.
  - `no GSAP, nothing hidden`: block `js/vendor/*` (CDP `Network.setBlockedURLs`, add a `block(urls)` helper to `cdp.js` if missing), load `manual.html`: no `html.fx`, all `.fm-vol` visible, no JS errors from `manual-fx.js`.
  - `COPY confirms`: button text `TRANSMITTED`.
- [ ] **Step 2:** Run `node tests/manual.test.js`. Expected: the new checks FAIL.
- [ ] **Step 3:** Implement `manual-fx.js`: return early unless `window.gsap && window.ScrollTrigger && window.ScrambleTextPlugin && window.DrawSVGPlugin && window.SplitText`; `gsap.registerPlugin(...)`; everything inside `gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', ...)`; add `html.fx` only inside that callback, and set each element's starting state with `gsap.set` immediately before creating its trigger (no CSS hides anything). ScrambleText must end on the exact original text (`data-text`). Generator: `data-text` on each h2, the frame SVG on `.fm-vol`, and before `manual-fx.js` the five `defer` vendor tags in this order: `gsap`, `ScrollTrigger`, `ScrambleTextPlugin`, `DrawSVGPlugin`, `SplitText`.
- [ ] **Step 4:** Regenerate; run `node tests/run.js` → exit 0. Screenshots of `manual.html` and `manual-claude-1.html` at 375, 1920, 2560 (built-in browser), mid-animation and settled; check the 2560 run fires the last section's trigger.
- [ ] **Step 5:** Commit `site4: the manuals move -- frames draw, headings decode, COPY transmits (GSAP, off under reduced motion)`.

### Task 4: Review and clean-up
- [ ] **Step 1:** `ponytail:ponytail-review` over the branch's diff; apply cuts that keep tests green.
- [ ] **Step 2:** `node tests/run.js` → exit 0; `python tools/test_gen_manual.py` → `ok`.
- [ ] **Step 3:** Commit any clean-up `site4: tidy the manual library`. Do not push: the owner approves each push (pushing `main` deploys woundwort.xyz).
