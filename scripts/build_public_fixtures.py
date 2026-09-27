"""Write the discovered-public-shop fixtures (additive to scripts/build_fixtures.py).

- data/fixtures/shops_public.json : GET /shops?source=public
- data/fixtures/shop_pub-001.json : GET /shops/pub-001 (one example detail)

Both come straight from engine.public over data/processed/shops_public.json, so the web
fixture mode shows exactly what the engine serves. data/fixtures/shops.json (synthetic,
GET /shops in the demo manifest) is not touched, and index.json does not map these files:
public shops are listed but never routed, so the demo flow never reads them.

Usage:
  .venv/bin/python scripts/build_public_fixtures.py          # write
  .venv/bin/python scripts/build_public_fixtures.py --check  # exit 1 if out of date
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine import public

FIXTURES = ROOT / "data" / "fixtures"
EXAMPLE_ID = "pub-001"


def render(value: object) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def build() -> dict[str, str]:
    return {
        "shops_public.json": render(public.list_response()),
        f"shop_{EXAMPLE_ID}.json": render(public.detail(EXAMPLE_ID)),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="fail if the files are out of date")
    args = ap.parse_args(argv)
    files = build()
    stale = []
    for name, text in files.items():
        path = FIXTURES / name
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
        else:
            path.write_text(text, encoding="utf-8")
            print(f"wrote {path.relative_to(ROOT)}")
    if stale:
        print("out of date: " + ", ".join(stale) + " (run scripts/build_public_fixtures.py)")
        return 1
    n = len(public.ids())
    print(f"{'ok' if args.check else 'done'}: {n} discovered public shops")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
