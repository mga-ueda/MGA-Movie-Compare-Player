#!/usr/bin/env python3
"""Split monolithic index.html into css/, js/, and a slim index.html (doc folds stay inline)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "index.html"
lines = SRC.read_text(encoding="utf-8").splitlines(keepends=True)

# --- CSS (lines 10-1277, inside <style>) ---
css = "".join(lines[9:1277])
(ROOT / "css").mkdir(exist_ok=True)
(ROOT / "css" / "main.css").write_text(css, encoding="utf-8")
print("wrote css/main.css")

# --- JS (inside <script> IIFE, split by section markers) ---
js_ranges = [
    ("dom-refs.js", 1752, 1806),
    ("ui-helpers.js", 1807, 1843),
    ("view-layout.js", 1844, 1932),
    ("session-state.js", 1933, 1990),
    ("prefs-log.js", 1991, 2171),
    ("indexeddb.js", 2172, 2347),
    ("init-prefs.js", 2348, 2361),
    ("mp4-fps.js", 2362, 2548),
    ("files-panels.js", 2549, 2786),
    ("timecode-seek.js", 2787, 3565),
    ("webaudio.js", 3566, 3677),
    ("drop-files.js", 3678, 3815),
    ("events-boot.js", 3816, 4306),
]
(ROOT / "js").mkdir(exist_ok=True)

def unindent_script(chunk_lines):
    out = []
    for line in chunk_lines:
        out.append(line[8:] if line.startswith("        ") else line)
    return "".join(out)

for name, start, end in js_ranges:
    (ROOT / "js" / name).write_text(unindent_script(lines[start - 1 : end]), encoding="utf-8")
    print(f"wrote js/{name}")

dom_path = ROOT / "js" / "dom-refs.js"
dom_text = dom_path.read_text(encoding="utf-8")
dom_text = dom_text.replace(
    "単一 index.html（ビルド不要・原則 file:// 可）。",
    "複数ファイル構成（ビルド不要・原則 file:// 可）。index.html 末尾の script 順で同一グローバルスコープに連結。",
)
if dom_text.startswith("(function () {\n"):
    dom_text = dom_text[len("(function () {\n") :]
dom_text = dom_text.replace(
    "本スクリプト内の「// === 数字.」",
    "js/ 内の「// === 数字.」",
)
dom_path.write_text(dom_text, encoding="utf-8")

boot_path = ROOT / "js" / "events-boot.js"
boot_text = boot_path.read_text(encoding="utf-8").rstrip()
if boot_text.endswith("})();"):
    boot_path.write_text(boot_text[: -len("})();")] + "\n", encoding="utf-8")

# --- Doc folds stay in index.html (no separate manual/) ---
manual_inner = "".join(lines[1497:1725])

# --- Slim index.html ---
head = "".join(lines[0:8])
body_start = "".join(lines[1279:1497])  # <body> through bottom-info end
body_end = "".join(lines[1726:1750])  # footer, inputs, canvas (no script)

js_scripts = "\n".join(
    f'    <script src="js/{name}"></script>'
    for name, _, _ in js_ranges
)

index_html = f"""{head}
    <link rel="stylesheet" href="css/main.css">
</head>
{body_start}
{manual_inner}
{body_end}
{js_scripts}
</body>
</html>
"""
(ROOT / "index.html").write_text(index_html, encoding="utf-8")
print("wrote index.html")
