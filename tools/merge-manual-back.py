#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRAGMENT = ROOT / "tools" / "_manual_fragment.html"
INDEX = ROOT / "index.html"

if not FRAGMENT.exists():
    raise SystemExit("tools/_manual_fragment.html not found")
manual_body = FRAGMENT.read_text(encoding="utf-8")

index = INDEX.read_text(encoding="utf-8")
old = (
    '    <p class="drop-zone-note app-manual-link">\n'
    '        <a href="manual/index.html">使い方・特記事項・バージョン情報・ソース改変ガイド（マニュアル）</a>\n'
    "    </p>\n"
    "\n"
    '    <footer class="app-site-footer">'
)
if old not in index:
    raise SystemExit("anchor not found in index.html")
INDEX.write_text(index.replace(old, manual_body + "\n    <footer class=\"app-site-footer\">"), encoding="utf-8")
print("done", len(INDEX.read_text(encoding="utf-8").splitlines()), "lines")
