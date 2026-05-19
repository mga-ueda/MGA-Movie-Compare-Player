#!/usr/bin/env python3
"""Deprecated: use tools/sync-docs.py instead."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYNC = ROOT / "tools" / "sync-docs.py"

if __name__ == "__main__":
    print("merge-manual-back.py is deprecated. Running tools/sync-docs.py …", file=sys.stderr)
    raise SystemExit(subprocess.call([sys.executable, str(SYNC)], cwd=ROOT))
