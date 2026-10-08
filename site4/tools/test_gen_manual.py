"""Self-check for gen_manual.py's header parsing and page layout. Run: python tools/test_gen_manual.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_manual import build_manual, layout, parse_header, short, split_sections  # noqa: E402


def raises(fn, *a):
    try:
        fn(*a)
    except ValueError as e:
        return str(e)
    return None


HEAD = """---
title: T
blurb: B.
date: 2026-10-07
parts:
  - Concepts | What. | 2-3
---
## 1. One
a
## 2. Two
b
## 3. Three
c
## 4. Four
d
"""

meta, body = parse_header(HEAD, "x.md")
assert meta["title"] == "T" and meta["blurb"] == "B." and meta["date"] == "2026-10-07"
assert meta["revision"] == "A" and meta["platform"] is None
assert meta["subject"] == "General" and meta["spine"] is None   # the library shelf and spine label default
sm, _ = parse_header(HEAD.replace("date:", "subject: AI tools\nspine: Short\ndate:"), "x.md")
assert sm["subject"] == "AI tools" and sm["spine"] == "Short"
assert meta["parts"] == [("Concepts", "What.", [2, 3])], meta["parts"]
secs = split_sections(body, "x.md")
assert sorted(secs) == [1, 2, 3, 4] and secs[2][0] == "Two"

msg = raises(parse_header, HEAD.replace("date: 2026-10-07\n", ""), "x.md")
assert msg and msg.startswith("x.md:"), msg
assert raises(split_sections, "no sections here", "x.md")
assert raises(parse_header, HEAD.replace("2026-10-07", "2026-13-45"), "x.md")   # not a real date

pages = layout(meta, secs, "x.md")
assert [p["nav"] for p in pages] == ["INDEX", "P1"], pages
assert pages[0]["sections"] == [1, 4] and pages[1]["sections"] == [2, 3]
assert [p["slug_n"] for p in pages] == [0, 1]

src = dict(meta, parts=[("Concepts", "W.", [2, 3]), ("Sources", "S.", [4])])
assert [p["nav"] for p in layout(src, secs, "x.md")] == ["INDEX", "P1", "SRC"]

plain = dict(meta, parts=[])
pp = layout(plain, {1: ("One", ""), 2: ("Two", ""), 3: ("Three", "")}, "x.md")
assert [p["nav"] for p in pp] == ["INDEX", "P1", "P2"] and pp[1]["title"] == "Two"

assert raises(layout, dict(meta, parts=[("A", "a", [2, 3]), ("B", "b", [3])]), secs, "x.md")
assert raises(layout, dict(meta, parts=[("A", "a", [2, 9])]), {1: ("", ""), 2: ("", "")}, "x.md")

assert short("Terminal and CLI basics on Windows") == "Terminal"
assert short("Mental model and core vocabulary") == "Mental model"
assert short("Installing Claude Code on Windows") == "Installing Claude Code"
assert short("claude.ai features") == "claude.ai features"
assert short("Skills") == "Skills"
# plain Markdown: no parts, no exercises -> an index and a page per section, no Exercises panel
pm, pb = parse_header("---\ntitle: X\nblurb: Y.\ndate: 2026-10-08\n---\n## 1. A\na\n## 2. B\nb\n## 3. C\nc\n", "x.md")
files, summary = build_manual("x", pm, split_sections(pb, "x.md"), 2)
assert sorted(files) == ["manual-x-1.html", "manual-x-2.html", "manual-x.html"], sorted(files)
assert "Exercises" not in files["manual-x.html"] and summary["exercises"] == 0 and summary["parts"] == 2
assert 'href="manual.html"' in files["manual-x-1.html"]   # ALL MANUALS
# two manuals that would write the same file (a's part 1 and a-1's index are both manual-a-1.html) stop the build
import tempfile as _tf
from gen_manual import main as _main
with _tf.TemporaryDirectory() as _d:
    _m = Path(_d) / "docs" / "manuals"
    _m.mkdir(parents=True)
    (_m / "a.md").write_text("---\ntitle: A\nblurb: a.\ndate: 2026-10-08\n---\n## 1. One\nx\n## 2. Two\ny\n", encoding="utf-8")
    (_m / "a-1.md").write_text("---\ntitle: B\nblurb: b.\ndate: 2026-10-09\n---\n## 1. One\nx\n", encoding="utf-8")
    assert _main(Path(_d)) == 1, "a collision must fail the build"
    assert not list(Path(_d).glob("*.html")), "and write nothing"
# every local stylesheet and script carries a content fingerprint, so a changed file is never served stale
import re as _re
from gen_manual import fingerprint  # noqa: E402  (applied as each page is written)
local = _re.findall(r'(?:href|src)="((?:css|js)/[^"]+)"', fingerprint(files["manual-x.html"]))
assert local and all(_re.search(r"\?v=[0-9a-f]{8}$", u) for u in local), local
print("ok")
