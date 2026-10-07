"""Self-check for gen_manual.py's header parsing and page layout. Run: python tools/test_gen_manual.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_manual import layout, parse_header, short, split_sections  # noqa: E402


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
assert meta["parts"] == [("Concepts", "What.", [2, 3])], meta["parts"]
secs = split_sections(body, "x.md")
assert sorted(secs) == [1, 2, 3, 4] and secs[2][0] == "Two"

msg = raises(parse_header, HEAD.replace("date: 2026-10-07\n", ""), "x.md")
assert msg and msg.startswith("x.md:"), msg
assert raises(split_sections, "no sections here", "x.md")

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

assert short("Terminal and CLI basics on Windows") == "Terminal and CLI"
assert short("Skills") == "Skills"
print("ok")
