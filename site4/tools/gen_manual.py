"""Generate site4's field manual pages from the guide's Markdown.

Usage: python3 gen_manual.py <guide.md> <site4 dir>
Writes manual.html and manual-1..6.html, plus code_map.json (code block number -> page) next to this script.
"""
import html
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag
from markdown_it import MarkdownIt
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import TextLexer, get_lexer_by_name

SRC = Path(sys.argv[1])
SITE = Path(sys.argv[2])
HERE = Path(__file__).resolve().parent
REV = "REV B"
DATE = "7 OCT 2026"

PAGES = [
    dict(file="manual.html", nav="INDEX", code="IDX", title="Field manual", kicker="FIELD MANUAL", h1="FIELD MANUAL",
         sections=[1], blurb="A Windows-first guide to Claude's agents, tools and workflow."),
    dict(file="manual-1.html", nav="P1", code="P1", title="Concepts", kicker="PART 1", h1="CONCEPTS",
         sections=[2, 3], blurb="What the pieces are and how they fit together."),
    dict(file="manual-2.html", nav="P2", code="P2", title="Foundations", kicker="PART 2", h1="FOUNDATIONS",
         sections=[4, 5], blurb="Terminal and JSON basics, which everything technical depends on."),
    dict(file="manual-3.html", nav="P3", code="P3", title="claude.ai", kicker="PART 3", h1="CLAUDE.AI",
         sections=[6, 7, 8], blurb="Projects, connectors and skills in the app you already use."),
    dict(file="manual-4.html", nav="P4", code="P4", title="Claude Code", kicker="PART 4", h1="CLAUDE CODE",
         sections=[9, 10, 11, 12, 13, 14, 15], blurb="Installing it, then MCP, subagents, hooks, plugins and automation."),
    dict(file="manual-5.html", nav="P5", code="P5", title="Applying it", kicker="PART 5", h1="APPLYING IT",
         sections=[16, 17, 18, 19, 20], blurb="Workflow recipes, safety, troubleshooting, a four-week plan and a cheat sheet."),
    dict(file="manual-6.html", nav="SRC", code="SRC", title="Sources", kicker="SOURCES", h1="SOURCES",
         sections=[21], blurb="Every page used, what was tested on Windows, and what could not be verified."),
]
SEC_PAGE = {s: p["file"] for p in PAGES for s in p["sections"]}
SHORT = {1: "Using it", 2: "Vocabulary", 3: "Surfaces", 4: "Terminal", 5: "JSON", 6: "claude.ai", 7: "Connectors",
         8: "Skills", 9: "Install", 10: "Essentials", 11: "MCP", 12: "Subagents", 13: "Hooks", 14: "Plugins",
         15: "Automation", 16: "Playbook", 17: "Safety", 18: "Troubleshooting", 19: "Four weeks", 20: "Reference",
         21: "Sources"}
LANG = {"powershell": "POWERSHELL", "json": "JSON", "python": "PYTHON", "markdown": "MARKDOWN", "yaml": "YAML",
        "text": "TEXT", "bash": "BASH", "": "TEXT"}

counter = {"code": 0}


def hl(code, lang, attrs):
    lang = (lang or "text").strip().lower()
    try:
        lexer = TextLexer() if lang in ("text", "") else get_lexer_by_name(lang)
    except Exception:
        lexer = TextLexer()
    body = highlight(code.rstrip("\n") + "\n", lexer, HtmlFormatter(nowrap=True))
    return f'<pre data-lang="{LANG.get(lang, lang.upper())}"><code>{body.rstrip()}</code></pre>'


md = MarkdownIt("commonmark", {"html": False, "highlight": hl}).enable("table")
text = SRC.read_text(encoding="utf-8")

# split into sections
parts = re.split(r"(?m)^## (\d+)\. (.+)$", text)
sections = {}
for i in range(1, len(parts), 3):
    sections[int(parts[i])] = (parts[i + 1].strip(), parts[i + 2])

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


def link_for_section(n):
    return f"{SEC_PAGE[n]}#sec-{n}"


EX_PAGE = {}
REC_PAGE = {}
for n, (title, body) in sections.items():
    for m in re.finditer(r"(?m)^### Exercise (\d+)", body):
        EX_PAGE[int(m.group(1))] = SEC_PAGE[n]
    for m in re.finditer(r"(?m)^### Recipe (\d+)", body):
        REC_PAGE[int(m.group(1))] = SEC_PAGE[n]

REF_RE = re.compile(r"\b(Sections?|sections?) (\d{1,2})\b|\b(Exercises?) (\d{1,2})\b|\b(Recipe) (\d)\b")


def render_section(n, page_file):
    title, body = sections[n]
    soup = BeautifulSoup(md.render(body), "html.parser")
    # diagram
    for p in soup.find_all("p"):
        if "embedded content" in p.get_text():
            p.replace_with(BeautifulSoup(DIAGRAM, "html.parser"))
    # code blocks
    for pre in soup.find_all("pre"):
        counter["code"] += 1
        k = counter["code"]
        CODE_MAP[k] = page_file
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
                if num in SEC_PAGE:
                    tgt = (f"#sec-{num}" if SEC_PAGE[num] == page_file else link_for_section(num))
                    return f'<a href="{tgt}">{mm.group(1)} {num}</a>'
            if mm.group(4):
                num = int(mm.group(4))
                if num in EX_PAGE:
                    tgt = f"#ex-{num}" if EX_PAGE[num] == page_file else f"{EX_PAGE[num]}#ex-{num}"
                    return f'<a href="{tgt}">{mm.group(3)} {num}</a>'
            if mm.group(6):
                num = int(mm.group(6))
                if num in REC_PAGE:
                    tgt = f"#recipe-{num}" if REC_PAGE[num] == page_file else f"{REC_PAGE[num]}#recipe-{num}"
                    return f'<a href="{tgt}">{mm.group(5)} {num}</a>'
            return mm.group(0)

        esc = REF_RE.sub(ref, esc)
        esc = re.sub(r"\b(Unverified|unverified|not verified|Not verified)\b", r'<span class="fm-flag">\1</span>', esc)
        esc = re.sub(r"\b(Tested)\b", r'<span class="fm-tested">\1</span>', esc)
        node.replace_with(BeautifulSoup(esc, "html.parser"))
    # sources: show the address under each link
    if n == 21:
        for a in soup.find_all("a"):
            if a.get("href", "").startswith("http"):
                u = soup.new_tag("span", attrs={"class": "fm-url"})
                u.string = a["href"]
                a.insert_after(u)
    return title, str(soup)


CODE_MAP = {}


def nav(cur):
    items = []
    for p in PAGES:
        lab = html.escape(p["nav"])
        attr = ' aria-current="page"' if p["file"] == cur else ""
        items.append(f'    <li><a href="{p["file"]}"{attr} title="{html.escape(p["title"])}">{lab}</a></li>')
    return "\n".join(items)


def page(p, panels_html, prev_p, next_p, total_ex):
    nsec = len(p["sections"])
    rail = [("PART", p["code"]), ("SECTIONS", str(nsec)), ("PLATFORM", "WINDOWS 11"), ("REVISION", f"{REV[-1]} · {DATE}")]
    if p["file"] == "manual.html":
        rail = [("PARTS", "5"), ("EXERCISES", str(total_ex)), ("PLATFORM", "WINDOWS 11"), ("REVISION", f"{REV[-1]} · {DATE}")]
    rail_html = "\n".join(f"    <li><b>{k}</b><span>{html.escape(v)}</span></li>" for k, v in rail)
    foot = []
    if prev_p:
        foot.append(f'<a href="{prev_p["file"]}">&#9666; {html.escape(prev_p["kicker"].title() if prev_p["kicker"] != "FIELD MANUAL" else "Index")}: {html.escape(prev_p["title"])}</a>')
    if next_p:
        foot.append(f'<a href="{next_p["file"]}">{html.escape(next_p["kicker"].title())}: {html.escape(next_p["title"])} &#9656;</a>')
    foot_html = f'  <nav class="fm-pager" aria-label="Manual pages">{"".join(foot)}</nav>\n' if foot else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- before the stylesheets: a script after them would wait for Google Fonts to load -->
<script src="js/link.js"></script>
<title>{html.escape(p["title"]) + ", " if p["title"] != "Field manual" else ""}Field manual, Sylas Lyu</title>
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=B612:wght@400;700&family=B612+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/cockpit.css">
<link rel="stylesheet" href="css/manual.css">
</head>
<!-- generated from the guide's Markdown by gen_manual.py; edit the source, not this file -->
<body class="page manual" style="--brg: 104">

<nav class="strip" aria-label="Field manual">
  <a class="ret" href="index.html" aria-keyshortcuts="Escape">&#9666; RETURN TO COCKPIT <kbd aria-hidden="true">ESC</kbd></a>
  <ul>
{nav(p["file"])}
  </ul>
</nav>

<main class="screen">
  <p class="bar"><span>{html.escape(p["kicker"])}</span> <span class="unit">SYLAS LYU &#183; FIELD MANUAL &#183; {REV}</span></p>
  <h1>{html.escape(p["h1"])}</h1>
  <p class="fm-blurb">{html.escape(p["blurb"])}</p>
  <ul class="rail">
{rail_html}
  </ul>
{panels_html}
{foot_html}</main>

<p class="sr-only" aria-live="polite" id="fm-live"></p>
<script src="js/bunnys.js" defer></script>
<script src="js/pagehud.js" defer></script>
<script src="js/manual.js" defer></script>
</body>
</html>
"""


def panel(n, title, body, code):
    return (f'  <section class="panel" id="sec-{n}" data-ref="FM-{n:02d}00 &#183; {REV}" data-sector="{html.escape(SHORT[n])}">\n'
            f'    <p class="sub">SECTION {n:02d}</p>\n'
            f'    <h2>{html.escape(title)}</h2>\n{body}\n  </section>\n')


exercises = []
for n, (title, body) in sections.items():
    for m in re.finditer(r"(?m)^### Exercise (\d+)(.*?):\s*(.*)$", body):
        exercises.append((int(m.group(1)), m.group(3)[0].upper() + m.group(3)[1:], n))

rendered = {}
for p in PAGES:
    for n in p["sections"]:
        rendered[n] = render_section(n, p["file"])

for i, p in enumerate(PAGES):
    panels = ""
    if p["file"] == "manual.html":
        rows = []
        for q in PAGES[1:]:
            secs = "".join(f'<li><a href="{q["file"]}#sec-{s}">{s:02d} {html.escape(sections[s][0])}</a></li>' for s in q["sections"])
            rows.append(f'<dt><a href="{q["file"]}">{html.escape(q["kicker"])}</a></dt><dd>{html.escape(q["title"])}<ul class="list">{secs}</ul></dd>')
        panels += ('  <section class="panel" data-ref="FM-0001 &#183; ' + REV + '" data-sector="Contents">\n'
                   '    <p class="sub">INDEX</p>\n    <h2>Contents</h2>\n'
                   '    <p>Every code block has a COPY button, so commands paste exactly as written. Section and exercise numbers match the PDF edition.</p>\n'
                   f'    <dl class="rows">{"".join(rows)}</dl>\n  </section>\n')
        exl = "".join(f'<li><a href="{EX_PAGE[e]}#ex-{e}">EX-{e:02d} {html.escape(t)}</a> <span class="meta">SEC {s:02d}</span></li>' for e, t, s in exercises)
        panels += ('  <section class="panel" data-ref="FM-0002 &#183; ' + REV + '" data-sector="Exercises">\n'
                   '    <p class="sub">TRAINING</p>\n    <h2>Exercises</h2>\n'
                   '    <p>Each exercise says what output to expect. The four-week plan in <a href="manual-5.html#sec-19">section 19</a> puts them in order.</p>\n'
                   f'    <ul class="list fm-exlist">{exl}</ul>\n  </section>\n')
    for n in p["sections"]:
        title, body = rendered[n]
        panels += panel(n, title, body, p["code"])
    prev_p = PAGES[i - 1] if i > 0 else None
    next_p = PAGES[i + 1] if i + 1 < len(PAGES) else None
    (SITE / p["file"]).write_text(page(p, panels, prev_p, next_p, len(exercises)), encoding="utf-8")
    print("wrote", p["file"])

(HERE / "code_map.json").write_text(json.dumps(CODE_MAP), encoding="utf-8")
print("code blocks", counter["code"], "exercises", len(exercises))
