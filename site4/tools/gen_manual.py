"""Generate site4's field manual library from docs/manuals/*.md.

Usage, from site4/: python tools/gen_manual.py
Each manual <slug>.md becomes manual-<slug>.html (its index) and manual-<slug>-<n>.html (its parts); manual.html
lists them all. A header error in any file stops the build before anything is written. See DESIGN.md.
"""
import hashlib
import html
import json
import math
import re
import sys
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag
from markdown_it import MarkdownIt
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import TextLexer, get_lexer_by_name

HERE = Path(__file__).resolve().parent
LANG = {"powershell": "POWERSHELL", "json": "JSON", "python": "PYTHON", "markdown": "MARKDOWN", "yaml": "YAML",
        "text": "TEXT", "bash": "BASH", "": "TEXT"}



def hl(code, lang, attrs):
    lang = (lang or "text").strip().lower()
    try:
        lexer = TextLexer() if lang in ("text", "") else get_lexer_by_name(lang)
    except Exception:
        lexer = TextLexer()
    body = highlight(code.rstrip("\n") + "\n", lexer, HtmlFormatter(nowrap=True))
    return f'<pre data-lang="{LANG.get(lang, lang.upper())}"><code>{body.rstrip()}</code></pre>'


md = MarkdownIt("commonmark", {"html": False, "highlight": hl}).enable("table")

DIAGRAM = """
<figure class="fm-loop">
  <svg viewBox="0 0 452 352" role="img" aria-label="The agent loop: you give a task, the model picks the next action, the app runs the tool, the result goes back to the model, repeating until the task is done.">
    <defs><marker id="fm-arr" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8CFFC1"/></marker></defs>
    <g fill="none" stroke="#8CFFC1" stroke-width="1.6" marker-end="url(#fm-arr)">
      <path d="M89,144 C89,88 108,44 130,44"/><path d="M308,44 C342,44 352,92 352,140"/><path d="M352,206 C352,262 338,308 312,308"/>
      <path d="M220,276 L220,78" stroke-dasharray="6 5"/>
    </g>
    <g font-family="B612 Mono, monospace" text-anchor="middle">
      <rect x="134" y="14" width="172" height="60" fill="#0E1830" stroke="#8CFFC1"/>
      <text x="220" y="40" font-size="16" font-weight="700" fill="#8CFFC1">MODEL</text><text x="220" y="60" font-size="11" fill="#DDE7EE">picks the next action</text>
      <rect x="4" y="144" width="170" height="60" fill="#070C15" stroke="rgba(221,231,238,.4)"/>
      <text x="89" y="170" font-size="16" font-weight="700" fill="#DDE7EE">YOU</text><text x="89" y="190" font-size="11" fill="#DDE7EE">give a task</text>
      <rect x="266" y="144" width="170" height="60" fill="#070C15" stroke="rgba(221,231,238,.4)"/>
      <text x="351" y="170" font-size="16" font-weight="700" fill="#DDE7EE">APP</text><text x="351" y="190" font-size="11" fill="#DDE7EE">runs the tool</text>
      <rect x="134" y="278" width="172" height="60" fill="#070C15" stroke="rgba(221,231,238,.4)"/>
      <text x="220" y="304" font-size="16" font-weight="700" fill="#DDE7EE">RESULT</text><text x="220" y="324" font-size="11" fill="#DDE7EE">goes back to the model</text>
      <text x="210" y="236" text-anchor="end" font-size="11" fill="rgba(221,231,238,.55)">REPEATS UNTIL</text>
      <text x="210" y="251" text-anchor="end" font-size="11" fill="rgba(221,231,238,.55)">THE TASK IS DONE</text>
      <g font-size="12" font-weight="700" fill="#060A12">
        <circle cx="138" cy="16" r="12" fill="#FFB02E"/><text x="138" y="20.5">I</text>
        <circle cx="342" cy="88" r="12" fill="#FF3347"/><text x="342" y="92.5">H</text>
        <circle cx="437" cy="146" r="12" fill="#8CFFC1"/><text x="437" y="150.5">T</text>
        <circle cx="437" cy="202" r="12" fill="#DDE7EE"/><text x="437" y="206.5">S</text>
      </g>
    </g>
  </svg>
  <dl class="rows fm-legend">
    <dt>I</dt><dd>Instructions and skills shape what the model chooses: CLAUDE.md, Project instructions, profile preferences, skills.</dd>
    <dt>T</dt><dd>Tools, MCP servers and connectors add actions the app can run for the model.</dd>
    <dt>H</dt><dd>Hooks run at fixed moments, including around every tool call, and can block it.</dd>
    <dt>S</dt><dd>Subagents are a tool call that starts a separate loop with its own context and hands back a summary.</dd>
    <dt>P</dt><dd>A plugin is one install that can bring several of the above at once.</dd>
  </dl>
  <figcaption class="meta">THE AGENT LOOP, AND WHERE EACH ADD-ON ATTACHES</figcaption>
</figure>
"""


REF_RE = re.compile(r"\b(Sections?|sections?) (\d{1,2})\b|\b(Exercises?) (\d{1,2})\b|\b(Recipe) (\d)\b")
LEAD_RE = re.compile(r"([A-Z][^:.\n]{0,48}):\s+")   # a lead-in: up to the first colon, no full stop before it


def parse_header(text, name):
    """The `---` block at the top of a manual: meta dict and the body after it. ValueError names the file."""
    text = text.replace("\r\n", "\n")
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise ValueError(f"{name}: no header (a block between --- lines at the very top)")
    meta = dict(revision="A", platform=None, code_blocks=None, legacy=None, parts=[], subject="General", spine=None)
    key = None
    for line in m.group(1).split("\n"):
        if not line.strip():
            continue
        if key == "parts" and line.startswith("  - "):
            bits = [b.strip() for b in line[4:].split("|")]
            if len(bits) != 3 or not re.fullmatch(r"\d+(-\d+)?", bits[2]):
                raise ValueError(f"{name}: a part reads 'Title | Blurb | 2-3', not '{line.strip()}'")
            a, _, b = bits[2].partition("-")
            meta["parts"].append((bits[0], bits[1], list(range(int(a), int(b or a) + 1))))
            continue
        key, sep, val = (s.strip() for s in line.partition(":"))
        if not sep:
            raise ValueError(f"{name}: header line without a colon: '{line.strip()}'")
        if key != "parts":
            meta[key] = int(val) if key == "code_blocks" else val
    for k in ("title", "blurb", "date"):
        if not meta.get(k):
            raise ValueError(f"{name}: the header has no {k}")
    try:
        date.fromisoformat(meta["date"])
    except ValueError:
        raise ValueError(f"{name}: date must be a real date as YYYY-MM-DD, not '{meta['date']}'") from None
    return meta, text[m.end():]


def split_sections(body, name):
    """`## N. Title` sections: {N: (title, markdown)}."""
    bits = re.split(r"(?m)^## (\d+)\. (.+)$", body)
    if len(bits) < 4:
        raise ValueError(f"{name}: no sections (headings like '## 1. Title')")
    return {int(bits[i]): (bits[i + 1].strip(), bits[i + 2]) for i in range(1, len(bits), 3)}


def layout(meta, sections, name):
    """The manual's pages: its index (slug_n 0: section 1 and any section in no part), then a page per part.
    No parts listed: every section after 1 is a part of its own."""
    parts = meta["parts"] or [(sections[n][0], "", [n]) for n in sorted(sections) if n != 1]
    used, pages = set(), []
    for i, (title, blurb, secs) in enumerate(parts, 1):
        for s in secs:
            if s not in sections:
                raise ValueError(f"{name}: part '{title}' names section {s}, which doesn't exist")
            if s in used:
                raise ValueError(f"{name}: section {s} is in two parts")
            used.add(s)
        src = title == "Sources"
        pages.append(dict(slug_n=i, nav="SRC" if src else f"P{i}", title=title, kicker="SOURCES" if src else f"PART {i}",
                          h1=title.upper(), blurb=blurb, sections=secs))
    index = dict(slug_n=0, nav="INDEX", title=meta["title"], kicker="FIELD MANUAL", h1=meta["title"].upper(),
                 blurb=meta["blurb"], sections=[n for n in sorted(sections) if n not in used])
    return [index] + pages


def short(title):
    """A section's ladder label: the heading up to its first 'and', comma or colon, at most three words."""
    return " ".join(re.split(r" and |[,:]", title)[0].split()[:3])



def render_section(st, n, page_file):
    title, body = st["sections"][n]
    soup = BeautifulSoup(md.render(body), "html.parser")
    # diagram
    for p in soup.find_all("p"):
        if "embedded content" in p.get_text():
            p.replace_with(BeautifulSoup(DIAGRAM, "html.parser"))
    # code blocks
    for pre in soup.find_all("pre"):
        st["code"] += 1
        k = st["code"]
        lang = pre.get("data-lang", "TEXT")
        del pre["data-lang"]
        box = soup.new_tag("div", attrs={"class": "fm-code", "id": f"c-{k}"})
        head = soup.new_tag("div", attrs={"class": "fm-code-head"})
        lab = soup.new_tag("span")
        lab.string = f"{lang} · C-{k:02d}"
        btn = soup.new_tag("button", attrs={"type": "button", "class": "copy", "aria-label": f"Copy code block {k}"})
        btn.string = "COPY"
        head.extend([lab, btn])
        pre.insert_before(box)
        box.append(head)
        box.append(pre.extract())
    # tables scroll inside their own box
    for tbl in soup.find_all("table"):
        w = soup.new_tag("div", attrs={"class": "fm-table", "tabindex": "0", "role": "region", "aria-label": "Table"})
        tbl.insert_before(w)
        w.append(tbl.extract())
    # lists
    for ul in soup.find_all(["ul", "ol"]):
        if ul.find_parent("dl") is None:
            ul["class"] = ul.get("class", []) + ["list"]
    for li in soup.find_all("li"):
        first = li.contents[0] if li.contents else None
        if isinstance(first, NavigableString) and str(first).startswith("[ ] "):
            first.replace_with(str(first)[4:])
            box = soup.new_tag("span", attrs={"class": "fm-box", "aria-hidden": "true"})
            li.insert(0, box)
            li.parent["class"] = ["fm-tasks"]
    # h3 blocks
    for h3 in list(soup.find_all("h3")):
        t = h3.get_text()
        m = re.match(r"Exercise (\d+)(.*?):\s*(.*)", t)
        r = re.match(r"Recipe (\d+):\s*(.*)", t)
        if m:
            wrap = soup.new_tag("div", attrs={"class": "fm-ex", "id": f"ex-{m.group(1)}"})
            tag = f"EX-{int(m.group(1)):02d}"
            rest = m.group(3)[0].upper() + m.group(3)[1:]
            note = m.group(2).strip(" ()")
        elif r:
            wrap = soup.new_tag("div", attrs={"class": "fm-ex fm-recipe", "id": f"recipe-{r.group(1)}"})
            tag = f"RECIPE {r.group(1)}"
            rest = r.group(2)[0].upper() + r.group(2)[1:]
            note = ""
        elif t.strip() == "Safety" or t.startswith("Safety rules"):
            wrap = soup.new_tag("div", attrs={"class": "fm-caution"})
            tag, rest, note = "CAUTION", t, ""
        elif t.startswith("Best practices"):
            wrap = soup.new_tag("div", attrs={"class": "fm-best"})
            tag, rest, note = "BEST PRACTICE", t, ""
        else:
            continue
        h3.insert_before(wrap)
        node = h3
        while node is not None:
            nxt = node.next_sibling
            if node is not h3 and isinstance(node, Tag) and node.name in ("h2", "h3"):
                break
            wrap.append(node.extract())
            node = nxt
        h3.clear()
        s = soup.new_tag("span", attrs={"class": "fm-tag"})
        s.string = tag
        h3.append(s)
        h3.append(" " + rest)
        if note:
            ns = soup.new_tag("span", attrs={"class": "fm-note"})
            ns.string = note
            h3.append(ns)
    # a lead-in before a colon ("Expected:", "Client: the AI app") is bold, so a list skims: in a list
    # where most items have one, all of them; elsewhere only a short one (a long one is a sentence)
    def lead(el):
        first = el.contents[0] if el.contents else None
        return isinstance(first, NavigableString) and LEAD_RE.match(str(first))
    listed = set()
    for ul in soup.find_all(["ul", "ol"]):
        items = ul.find_all("li", recursive=False)
        if items and sum(1 for li in items if lead(li)) * 2 > len(items):
            listed.update(id(li) for li in items)
    for el in soup.find_all(["li", "p"]):
        m = lead(el)
        if m and (id(el) in listed or len(m.group(1).split()) <= 5):
            first = el.contents[0]
            b = soup.new_tag("strong")
            b.string = m.group(1) + ":"
            first.replace_with(str(first)[m.end():])
            el.insert(0, " ")
            el.insert(0, b)
    # Expected paragraphs and Unverified/Tested flags; cross-reference links
    for p in soup.find_all("p"):
        if p.get_text().lstrip().startswith("Expected"):
            p["class"] = p.get("class", []) + ["fm-expected"]
    for node in list(soup.find_all(string=True)):
        if node.find_parent(["pre", "code", "a", "h3", "figure", "svg"]) is not None:
            continue
        s = str(node)
        if not (REF_RE.search(s) or re.search(r"\b(Unverified|unverified|Tested|not verified|Not verified)\b", s)):
            continue
        esc = html.escape(s, quote=False)

        def ref(mm):
            if mm.group(2):
                num = int(mm.group(2))
                if num in st["sec"]:
                    tgt = f"#sec-{num}" if st["sec"][num] == page_file else f"{st['sec'][num]}#sec-{num}"
                    return f'<a href="{tgt}">{mm.group(1)} {num}</a>'
            if mm.group(4):
                num = int(mm.group(4))
                if num in st["ex"]:
                    tgt = f"#ex-{num}" if st["ex"][num] == page_file else f"{st['ex'][num]}#ex-{num}"
                    return f'<a href="{tgt}">{mm.group(3)} {num}</a>'
            if mm.group(6):
                num = int(mm.group(6))
                if num in st["rec"]:
                    tgt = f"#recipe-{num}" if st["rec"][num] == page_file else f"{st['rec'][num]}#recipe-{num}"
                    return f'<a href="{tgt}">{mm.group(5)} {num}</a>'
            return mm.group(0)

        esc = REF_RE.sub(ref, esc)
        esc = re.sub(r"\b(Unverified|unverified|not verified|Not verified)\b", r'<span class="fm-flag">\1</span>', esc)
        esc = re.sub(r"\b(Tested)\b", r'<span class="fm-tested">\1</span>', esc)
        node.replace_with(BeautifulSoup(esc, "html.parser"))
    # sources: show the address under each link
    if title == "Sources":
        for a in soup.find_all("a"):
            if a.get("href", "").startswith("http"):
                u = soup.new_tag("span", attrs={"class": "fm-url"})
                u.string = a["href"]
                a.insert_after(u)
    return title, str(soup)


ORIGIN = "https://woundwort.xyz/"
# link previews for the hand-written pages (the title is each page's own <title>); the manuals' come from their blurbs
HAND_OG = {
    "index.html": "Sylas Lyu's portfolio, flown from a mecha cockpit: Psychology and UX Design at Purdue, research in "
                  "mental health data, healthcare analytics and responsible AI.",
    "pilot.html": "Pilot ID: Sylas Lyu, Psychology and UX Design junior at Purdue. Skills, leadership, certifications "
                  "and contact.",
    "missions.html": "Mission log: five research and work roles, from BrainCo and Antagen to Brown CNTR, Purdue's Human "
                     "Betterment Analytics Research Lab and the UNC NIcE X Lab.",
    "hangar.html": "The RX-124 Gundam TR-6 [Woundwort] in 3D, the unit Sylas Lyu pilots on this site. Mechanical design "
                   "by Kenki Fujioka.",
    "unknown.html": "An unidentified mobile suit at bearing 180. No transponder, no IFF. The channel is open.",
    "resume.html": "Sylas Lyu: Psychology and UX Design junior at Purdue. Research in mental health data, healthcare "
                   "analytics and responsible AI.",
}


def og(file, title, desc, image=None):
    """Link-preview tags (Open Graph + Twitter): a large card with the page's picture, img/og/<page>.png, which
    tools/gen_og.js takes. Between markers, so a rebuild replaces it."""
    image = image or file.replace(".html", ".png")
    url = ORIGIN + ("" if file == "index.html" else file[:-5])
    t, d = html.escape(title), html.escape(desc)
    return (f'<!-- og -->\n<meta name="description" content="{d}">\n'
            f'<meta property="og:type" content="website">\n<meta property="og:site_name" content="Sylas Lyu">\n'
            f'<meta property="og:title" content="{t}">\n<meta property="og:description" content="{d}">\n'
            f'<meta property="og:url" content="{url}">\n<meta property="og:image" content="{ORIGIN}img/og/{image}">\n'
            f'<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n<!-- /og -->\n')


# Ctrl+K (js/palette.js): the hand-written pages it lists; the manuals and their sections are added from the build
HAND_GO = [("Cockpit", "index.html", "HOME"), ("Pilot", "pilot.html", "SYLAS LYU"), ("Missions", "missions.html", "MISSION LOG"),
           ("Hangar", "hangar.html", "RX-124 TR-6 [WOUNDWORT]"), ("Unknown", "unknown.html", "OPEN CHANNEL"),
           ("Résumé", "resume.html", "PLAIN VIEW"), ("Field manuals", "manual.html", "LIBRARY")]
GO_SCRIPTS = '<script src="js/site-index.js" defer></script>\n<script src="js/palette.js" defer></script>\n'


def site_index(built):
    """js/site-index.js: everything Ctrl+K can find -- the pages, each manual, each of its sections."""
    items = [dict(t=t, h=h, s=s) for t, h, s in HAND_GO]
    for files, s in built:
        code = f'FM-{s["vol"]:02d}'
        items.append(dict(t=s["title"], h=fname(s["slug"], 0), s=code))
        for p in s["pages"]:
            for n in p["sections"]:
                items.append(dict(t=s["section_titles"][n], h=f'{p["file"]}#sec-{n}', s=f"{code} \u00b7 SECTION {n:02d}"))
    return "/* generated by tools/gen_manual.py: what Ctrl+K (js/palette.js) can find */\nwindow.BUNNYS_INDEX = " + \
        json.dumps(items, ensure_ascii=False, indent=0) + ";\n"


FONTS = "https://fonts.googleapis.com/css2?family=B612:wght@400;700&family=B612+Mono:wght@400;700&display=swap"


def stamp(iso):
    """2026-10-07 -> 7 OCT 2026"""
    d = date.fromisoformat(iso)
    return f"{d.day} {d:%b %Y}".upper()


def fname(slug, n):
    return f"manual-{slug}.html" if n == 0 else f"manual-{slug}-{n}.html"


def fingerprint(page, site=None):
    """css/ and js/ links get ?v=<first 8 of the file's sha1>: a changed file is a new URL, never a stale cache hit.
    Applied as a page is written, once every file it links (js/site-index.js too) is final."""
    def tag(x):
        f = (site or HERE.parent) / x.group(2)
        f = f if f.exists() else HERE.parent / x.group(2)
        return f'{x.group(1)}="{x.group(2)}?v={hashlib.sha1(f.read_bytes()).hexdigest()[:8]}"'
    return re.sub(r'(href|src)="((?:css|js)/[^"?]+)"', tag, page)


def shell(title, strip, main, bar_unit, kicker, h1, blurb, rail, og_html=""):
    """One sub-page: the cockpit's strip, the screen, the HUD scripts."""
    rail_html = "\n".join(f"    <li><b>{k}</b><span>{html.escape(v)}</span></li>" for k, v in rail)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- before the stylesheets: a script after them would wait for Google Fonts to load -->
<script src="js/link.js"></script>
<title>{html.escape(title)}</title>
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{FONTS}" rel="stylesheet">
<link rel="stylesheet" href="css/cockpit.css">
<link rel="stylesheet" href="css/manual.css">
{og_html}</head>
<!-- generated by tools/gen_manual.py from docs/manuals/*.md; edit the source, not this file -->
<body class="page manual" style="--brg: 104">

{strip}

<main class="screen">
  <p class="bar"><span>{html.escape(kicker)}</span> <span class="unit">{bar_unit}</span></p>
  <h1>{html.escape(h1)}</h1>
  <p class="fm-blurb">{html.escape(blurb)}</p>
  <ul class="rail">
{rail_html}
  </ul>
{main}</main>

<p class="sr-only" aria-live="polite" id="fm-live"></p>
<script src="js/bunnys.js" defer></script>
<script src="js/pagehud.js" defer></script>
<script src="js/manual.js" defer></script>
{GO_SCRIPTS}</body>
</html>
"""


CONTACTS = [("pilot.html", "PILOT"), ("missions.html", "MISSIONS"), ("hangar.html", "HANGAR")]
PORTFOLIO = [f for f, _ in CONTACTS] + ["resume.html"]   # hand-written pages whose strip this build keeps in step


def nav_strip(menu, cur, sub=""):
    """The one strip every sub-page carries: back to the cockpit, the contacts, and FIELD MANUAL as a dropdown
    of the library and every manual. menu: [(vol, slug, title)]; cur: this page's file; sub: a manual's parts row."""
    def a(href, text):
        mark = ' aria-current="page"' if href == cur else ""
        return f'<a href="{href}"{mark}>{text}</a>'
    here = ' class="is-here"' if cur.startswith("manual") else ""
    items = "\n".join(f"        <li>{a(fname(slug, 0), f'<b>FM-{vol:02d}</b> {html.escape(title)}')}</li>" for vol, slug, title in menu)
    return (f'<nav class="strip" aria-label="Cockpit">\n'
            f'  <a class="ret" href="index.html" aria-keyshortcuts="Escape">&#9666; RETURN TO COCKPIT <kbd aria-hidden="true">ESC</kbd></a>\n'
            f'  <ul aria-keyshortcuts="Q E">\n    <li><kbd aria-hidden="true">Q</kbd></li>\n'
            + "".join(f"    <li>{a(f, t)}</li>\n" for f, t in CONTACTS)
            + f'    <li class="strip-menu"><details><summary{here}><span class="wide">FIELD&nbsp;</span>MANUAL</summary>\n'
              f'      <ul>\n        <li>{a("manual.html", "ALL MANUALS")}</li>\n{items}\n      </ul></details></li>\n'
              f'    <li class="strip-menu strip-aa"><details><summary aria-label="Text size">Aa</summary>\n'
              f'      <ul role="radiogroup" aria-label="Text size">\n'
            + "".join(f'        <li><label><input type="radio" name="textsize" value="{v}"{" checked" if v == "m" else ""}> {v.upper()}</label></li>\n'
                      for v in ("s", "m", "l", "xl"))
            + f'      </ul></details></li>\n'
              f'    <li><kbd aria-hidden="true">E</kbd></li>\n  </ul>\n{sub}</nav>')


def build_manual(slug, meta, sections, vol, menu=None):
    """One manual's pages {filename: html} and its summary for the library. Cross-references resolve inside it."""
    pages = layout(meta, sections, slug + ".md")
    for p in pages:
        p["file"] = fname(slug, p["slug_n"])
    rev = f"REV {meta['revision']}"
    st = dict(sections=sections, code=0, sec={s: p["file"] for p in pages for s in p["sections"]}, ex={}, rec={})
    for n, (_, body) in sections.items():
        for x in re.finditer(r"(?m)^### Exercise (\d+)", body):
            st["ex"][int(x.group(1))] = st["sec"][n]
        for x in re.finditer(r"(?m)^### Recipe (\d+)", body):
            st["rec"][int(x.group(1))] = st["sec"][n]
    exercises = [(int(x.group(1)), x.group(3)[0].upper() + x.group(3)[1:], n)
                 for n, (_, body) in sections.items() for x in re.finditer(r"(?m)^### Exercise (\d+)(.*?):\s*(.*)$", body)]
    rendered = {n: render_section(st, n, p["file"]) for p in pages for n in p["sections"]}

    cur = ' aria-current="page"'
    unit = f"SYLAS LYU &#183; FM-{vol:02d} &#183; {rev}"
    files = {}
    for i, p in enumerate(pages):
        body = ""
        if p["slug_n"] == 0:
            rows = []
            for q in pages[1:]:
                secs = "".join(f'<li><a href="{q["file"]}#sec-{s}">{s:02d} {html.escape(sections[s][0])}</a></li>' for s in q["sections"])
                rows.append(f'<dt><a href="{q["file"]}">{html.escape(q["kicker"])}</a></dt><dd>{html.escape(q["title"])}<ul class="list">{secs}</ul></dd>')
            if rows:
                body += (f'  <section class="panel" data-ref="FM-{vol:02d}A0 &#183; {rev}" data-sector="Contents">\n'
                         '    <p class="sub">INDEX</p>\n    <h2>Contents</h2>\n'
                         '    <p>Every code block has a COPY button, so commands paste exactly as written.</p>\n'
                         f'    <dl class="rows">{"".join(rows)}</dl>\n  </section>\n')
            if exercises:
                exl = "".join(f'<li><a href="{st["ex"][e]}#ex-{e}">EX-{e:02d} {html.escape(t)}</a> <span class="meta">SEC {s:02d}</span></li>' for e, t, s in exercises)
                body += (f'  <section class="panel" data-ref="FM-{vol:02d}B0 &#183; {rev}" data-sector="Exercises">\n'
                         '    <p class="sub">TRAINING</p>\n    <h2>Exercises</h2>\n'
                         '    <p>Each exercise says what output to expect.</p>\n'
                         f'    <ul class="list fm-exlist">{exl}</ul>\n  </section>\n')
        for n in p["sections"]:
            title, html_ = rendered[n]
            body += (f'  <section class="panel" id="sec-{n}" data-ref="FM-{vol:02d}{n:02d} &#183; {rev}" data-sector="{html.escape(short(title))}">\n'
                     f'    <p class="sub">SECTION {n:02d}</p>\n'
                     f'    <h2>{html.escape(title)}</h2>\n{html_}\n  </section>\n')
        foot = []
        if i > 0:
            q = pages[i - 1]
            foot.append(f'<a href="{q["file"]}">&#9666; {"Index" if q["slug_n"] == 0 else html.escape(q["kicker"].title())}: {html.escape(q["title"])}</a>')
        if i + 1 < len(pages):
            q = pages[i + 1]
            foot.append(f'<a href="{q["file"]}">{html.escape(q["kicker"].title())}: {html.escape(q["title"])} &#9656;</a>')
        if foot:
            body += f'  <nav class="fm-pager" aria-label="Manual pages">{"".join(foot)}</nav>\n'
        if p["slug_n"] == 0:
            rail = [("PARTS", str(len(pages) - 1))] + ([("EXERCISES", str(len(exercises)))] if exercises else [])
        else:
            rail = [("PART", p["nav"]), ("SECTIONS", str(len(p["sections"])))]
        rail += ([("PLATFORM", meta["platform"].upper())] if meta["platform"] else []) + [("REVISION", f"{meta['revision']} · {stamp(meta['date'])}")]
        sub = (f'  <ul class="strip-sub" aria-label="{html.escape(meta["title"])}">\n'
               + "\n".join(f'    <li><a href="{q["file"]}"{cur if q is p else ""} title="{html.escape(q["title"])}">{q["nav"]}</a></li>'
                           for q in pages) + "\n  </ul>\n")
        strip = nav_strip(menu or [(vol, slug, meta["title"])], p["file"], sub)
        title = meta["title"] if p["slug_n"] == 0 else f'{p["title"]}, {meta["title"]}'
        files[p["file"]] = shell(f"{title}, Sylas Lyu", strip, body, unit, p["kicker"], p["h1"], p["blurb"], rail,
                                 og(p["file"], f"{title}, Sylas Lyu", p["blurb"] or meta["blurb"], fname(slug, 0).replace(".html", ".png")))
    summary = dict(meta, slug=slug, vol=vol, parts=len(pages) - 1, sections=len(sections), exercises=len(exercises),
                   code=st["code"], pages=pages,
                   section_titles={n: t for n, (t, _) in sections.items()})
    return files, summary


# the library's book art: a colour per subject, an emblem per book. Original, generated from the names, so a book
# keeps its look across rebuilds and a new one gets its own. No stripes (the owner's rule against hazard stripes).
SUBJECT_COLOURS = ["#8CFFC1", "#7FD4FF", "#FFB02E", "#FF8FA3", "#B79CFF", "#E6F27A"]


def subject_colour(subject):
    return SUBJECT_COLOURS[int(hashlib.md5(subject.lower().encode()).hexdigest(), 16) % len(SUBJECT_COLOURS)]


def emblem(slug, colour):
    """A mission-patch mark for one book: a tick ring, nested polygons and orbit dots, all seeded by its slug."""
    h = hashlib.md5(slug.encode()).digest()
    sides, rings, turn, ticks, dots = 3 + h[0] % 5, 2 + h[1] % 2, h[2] % 60, 24 + (h[3] % 3) * 12, 2 + h[4] % 3

    def pt(r, deg):
        a = math.radians(deg - 90)
        return 50 + r * math.cos(a), 50 + r * math.sin(a)
    out = [f'<circle cx="50" cy="50" r="46" fill="none" stroke="{colour}" stroke-opacity=".5"/>']
    for i in range(ticks):
        (x1, y1), (x2, y2) = pt(46, 360 * i / ticks), pt(41 if i % 3 else 37, 360 * i / ticks)
        out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{colour}" '
                   f'stroke-opacity="{.8 if i % 3 == 0 else .35}"/>')
    for k in range(rings):
        r, rot = 31 - k * 10, turn + k * 180 / sides
        poly = " ".join("%.1f,%.1f" % pt(r, rot + 360 * j / sides) for j in range(sides))
        out.append(f'<polygon points="{poly}" fill="{colour}" fill-opacity="{.06 + .06 * k:.2f}" stroke="{colour}" '
                   f'stroke-opacity="{.9 - .25 * k:.2f}" stroke-width="{1.6 - .4 * k:.1f}"/>')
    for d in range(dots):
        x, y = pt(41, h[5 + d] * 360 / 256)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.6" fill="{colour}"/>')
    core = " ".join("%.1f,%.1f" % pt(5, turn + 90 * j) for j in range(4))
    out.append(f'<polygon points="{core}" fill="{colour}"/>')
    return f'<svg class="fm-emblem" viewBox="0 0 100 100" aria-hidden="true" focusable="false">{"".join(out)}</svg>'


def spine_size(s):
    """A spine's px height, width and title size: length shows in height, parts in width, and the title is sized to
    fill the room between the emblem and the FM code (B612 Mono advances .6em, plus .08em letter-spacing)."""
    height = min(220, 150 + 5 * s["sections"])
    label = s.get("spine") or s["title"]
    size = max(8.0, min(14.0, (height - 70) / (len(label) * 0.68)))
    width = min(58, max(36, round(size * 1.6 + 16), 34 + 3 * s["parts"]))
    return height, width, round(size, 1), label


def library(summaries):
    """manual.html: the bookshelf. On display, the newest book face-out; under it a shelf per subject (A to Z) with a
    spine per manual. js/library.js pulls a book out onto the display when its spine is clicked; without it each spine
    is a plain link into its manual. Each book's display is a <template> library.js clones in."""
    books = sorted(summaries, key=lambda s: s["vol"])
    newest = max(summaries, key=lambda s: (s["date"], s["slug"]))

    def code(s):
        return f'FM-{s["vol"]:02d}'

    def face(s):
        line = f'{s["parts"]} PARTS' + (f' &#183; {s["exercises"]} EXERCISES' if s["exercises"] else "")
        parts = "".join(f'<li><a href="{p["file"]}">{html.escape(p["title"])}</a></li>' for p in s["pages"][1:])
        colour = subject_colour(s["subject"])
        return (f'<div class="fm-cover" style="--c:{colour}"><p class="fm-cover-top"><b>{code(s)}</b>'
                f'<span>{html.escape(s["subject"].upper())}</span></p>{emblem(s["slug"], colour)}'
                f'<h2>{html.escape(s["title"])}</h2><p class="fm-cover-foot">{line}</p></div>'
                f'<div class="fm-info"><p class="fm-k">{html.escape(s["subject"].upper())}</p><p>{html.escape(s["blurb"])}</p>'
                f'<p class="fm-k">PARTS</p><ul class="list">{parts}</ul>'
                f'<p class="fm-k">REVISION</p><p>{s["revision"]} &#183; {stamp(s["date"])}</p>'
                f'<p><a class="fm-open" href="{fname(s["slug"], 0)}">Open {code(s)} &#9656;</a></p></div>')

    body = ('  <section class="panel fm-display" data-ref="FM-0000 &#183; LIBRARY" data-sector="On display">\n'
            '    <p class="sub">ON DISPLAY</p>\n'
            f'    <div class="fm-stage" aria-live="polite">{face(newest)}</div>\n  </section>\n')
    for subject in sorted({s["subject"] for s in books}, key=str.lower):
        spines = ""
        for s in (b for b in books if b["subject"] == subject):
            out = s is newest
            mark = ' is-out" aria-current="true' if out else ""
            height, width, font, label = spine_size(s)
            colour = subject_colour(subject)
            spines += (f'      <a class="fm-spine{mark}" href="{fname(s["slug"], 0)}" data-fm="{code(s)}" '
                       f'style="height:{height}px;width:{width}px;--c:{colour};--fs:{font}px" title="{code(s)}: {html.escape(s["title"])}">'
                       f'{emblem(s["slug"], colour)}<span class="fm-spine-t">{html.escape(label)}</span>'
                       f'<b class="fm-spine-code" aria-hidden="true">{s["vol"]:02d}</b></a>\n')
        body += (f'  <section class="panel fm-shelf" data-ref="SHELF &#183; {html.escape(subject.upper())}" data-sector="{html.escape(subject)}">\n'
                 f'    <p class="sub">{html.escape(subject.upper())}</p>\n'
                 f'    <div class="fm-books">\n{spines}    </div>\n    <div class="fm-ledge"></div>\n  </section>\n')
    body += "".join(f'  <template id="tpl-{code(s).lower()}">{face(s)}</template>\n' for s in books)
    strip = nav_strip(sorted((s["vol"], s["slug"], s["title"]) for s in summaries), "manual.html")
    rail = [("VOLUMES", str(len(summaries))), ("EXERCISES", str(sum(s["exercises"] for s in summaries)))]
    page = shell("Field manuals, Sylas Lyu", strip, body, "SYLAS LYU &#183; FIELD MANUALS", "LIBRARY",
                 "FIELD MANUALS", "General guides, each one complete on its own.", rail,
                 og("manual.html", "Field manuals, Sylas Lyu", "A library of general guides to working with AI, each one "
                    "complete on its own, with exercises and copyable code."))
    return page.replace("</body>", '<script src="js/library.js" defer></script>\n</body>', 1)


def stub(target):
    """An old URL that forwards to its new page, #fragment and all (the guide's PDF links manual-N.html#c-K)."""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Moved</title>
<script>location.replace('{target}' + location.hash)</script>
</head>
<body><p>This page moved: <a href="{target}">{target}</a></p></body>
</html>
"""


def main(site):
    """Build every docs/manuals/*.md: check them all first, then write. Returns an exit code."""
    srcs = sorted((site / "docs" / "manuals").glob("*.md"))
    try:
        found = []
        for f in srcs:
            if not re.fullmatch(r"[a-z][a-z0-9-]*", f.stem):
                raise ValueError(f"{f.name}: a file name is lowercase letters, digits and hyphens, starting with a letter")
            meta, body = parse_header(f.read_text(encoding="utf-8"), f.name)
            found.append((f.stem, meta, split_sections(body, f.name)))
        found.sort(key=lambda t: (t[1]["date"], t[0]))
        menu = [(vol, slug, meta["title"]) for vol, (slug, meta, _) in enumerate(found, 1)]
        built = [build_manual(slug, meta, secs, vol, menu) for vol, (slug, meta, secs) in enumerate(found, 1)]
        for (slug, meta, _), (_, s) in zip(found, built):
            if meta["code_blocks"] is not None and meta["code_blocks"] != s["code"]:
                raise ValueError(f"{slug}.md: {s['code']} code blocks, the header pins {meta['code_blocks']} "
                                 f"(old links point at their numbers)")
        # every file the build writes, by who writes it: two writers for one name would overwrite each other
        owner = {"manual.html": "the library"}
        for (slug, meta, _), (files, s) in zip(found, built):
            names = list(files) + [f'{meta["legacy"]}-{p["slug_n"]}.html' for p in s["pages"][1:] if meta["legacy"]]
            for name in names:
                if name in owner:
                    raise ValueError(f"{slug}.md: would write {name}, which {owner[name]} writes too; rename one of them")
                owner[name] = f"{slug}.md"
    except ValueError as e:
        print("gen_manual:", e, file=sys.stderr)
        return 1
    # Ctrl+K's list first: the pages' fingerprints read it
    (site / "js").mkdir(exist_ok=True)
    (site / "js" / "site-index.js").write_text(site_index(built), encoding="utf-8")
    for (slug, meta, _), (files, s) in zip(found, built):
        for name, page in files.items():
            (site / name).write_text(fingerprint(page, site), encoding="utf-8")
        if meta["legacy"]:
            for p in s["pages"][1:]:
                (site / f'{meta["legacy"]}-{p["slug_n"]}.html').write_text(stub(p["file"]), encoding="utf-8")
        print(f'{slug}: {len(files)} pages, {s["code"]} code blocks, {s["exercises"]} exercises')
    (site / "manual.html").write_text(fingerprint(library([s for _, s in built]), site), encoding="utf-8")
    # the hand-written contact pages carry the same strip (its dropdown lists every manual)
    for f in PORTFOLIO:
        page = site / f
        if page.exists():
            text = page.read_text(encoding="utf-8")
            page.write_text(re.sub(r'<nav class="strip"[\s\S]*?</nav>', lambda _: nav_strip(menu, f), text, count=1), encoding="utf-8")
    # Ctrl+K's scripts on the hand-written pages (the generated ones have them in shell())
    go = fingerprint("<!-- go -->\n" + GO_SCRIPTS + "<!-- /go -->\n", site)
    for f in [h for _, h, _ in HAND_GO if h != "manual.html"]:
        page = site / f
        if page.exists():
            text = page.read_text(encoding="utf-8")
            text = (re.sub(r"<!-- go -->[\s\S]*?<!-- /go -->\n", lambda _: go, text) if "<!-- go -->" in text
                    else text.replace("</body>", go + "</body>", 1))
            page.write_text(text, encoding="utf-8")
    # and their link previews
    for f, desc in HAND_OG.items():
        page = site / f
        if page.exists():
            text = page.read_text(encoding="utf-8")
            block = og(f, html.unescape(re.search(r"<title>(.*?)</title>", text).group(1)), desc)
            text = (re.sub(r"<!-- og -->[\s\S]*?<!-- /og -->\n", lambda _: block, text) if "<!-- og -->" in text
                    else text.replace("</head>", block + "</head>", 1))
            page.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(HERE.parent))
