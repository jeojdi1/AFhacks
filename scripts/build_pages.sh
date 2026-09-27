#!/bin/bash
# GitHub Pages build: a static export of the demo-data version of the web app (no engine),
# served at https://jeojdi1.github.io/AFhacks/. Output: web/out (with .nojekyll).
#
#   scripts/build_pages.sh            # build web/out
#   PAGES_BASE_PATH=/x scripts/...    # another base path (default /AFhacks)
#
# The server-only /api/lan route (LAN IP for the phone QR page) is moved aside during the
# export and always restored, even if the build fails.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
STASH="$(mktemp -d)"
restore() {
  if [ -d "$STASH/api" ]; then mv "$STASH/api" "$WEB/app/api"; fi
  rm -rf "$STASH"
}
trap restore EXIT
mv "$WEB/app/api" "$STASH/api"

cd "$WEB"
rm -rf out
# Offer pages only for the (shop, job) pairs the fixtures name (the full 30 x 40 grid is ~500 MB).
PAGES_EXPORT=1 PAGES_OFFER_PAIRS="${PAGES_OFFER_PAIRS:-fixtures}" NEXT_PUBLIC_DEMO_MODE=fixtures npx next build
touch out/.nojekyll
# Next writes the apple-touch-icon link without the base path ("/apple-icon?..."); prefix it in
# the exported HTML and RSC payloads so it resolves under the Pages base path.
BASE="${PAGES_BASE_PATH:-/AFhacks}"
find out -type f \( -name '*.html' -o -name '*.txt' \) -exec perl -pi -e "s{(?<=\")/apple-icon\\?}{$BASE/apple-icon?}g" {} +
echo "Pages build: $(find out -name '*.html' | wc -l | tr -d ' ') HTML files, $(du -sh out | cut -f1) in web/out"
