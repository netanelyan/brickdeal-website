#!/usr/bin/env bash
# Regenerate the crawlable half of the site (deal/*.html, theme/*.html,
# archive.html, sitemap.xml) from the live deals.json feed.
#
# WHY A TIMER RATHER THAN A HOOK ON EACH FEED WRITE
#
#   - build.js rewrites EVERY deal page on each run. With several hundred deals
#     that is a full-directory rebuild, and calling it from publishNext() would
#     couple channel-posting latency to it. The drip path is meant to stay
#     untouched, and a build failure must never be able to disturb a post.
#   - A timer is self-healing. A missed run, a crash mid-build, or a feed write
#     landing while a build is in flight all resolve on the next tick. A
#     post-write hook needs its own locking and debouncing to match that.
#   - The mtime guard below makes idle ticks free, so a 2-minute period costs
#     nothing while bounding staleness at ~2 minutes.
#
# ATOMICITY
#
# build.js unlinks every existing page in OUT/deal before writing the new ones
# (see its main()), so pointing it at the live web root would leave a window
# where every deal page 404s — the same half-written-state problem the feed
# writer avoids with tmp+rename, but for the pages Google crawls. So we build
# into a staging tree and promote by renaming a symlink, which is atomic.
#
# Staging and release trees live under dot-directories so the single `hide .*`
# rule in the Caddyfile keeps them unreachable — a half-built tree or a
# superseded release must never be served, since an old release would expose
# stale prices on URLs a crawler could find.

set -euo pipefail

WEB_ROOT=/var/www/brickdeal
SITE_SRC=/opt/brickdeal-site
FEED="$WEB_ROOT/deals.json"
BASE=https://brickdealil.com
RELEASES="$WEB_ROOT/.releases"
KEEP_RELEASES=3

log() { echo "[brickdeal-build] $*"; }

[ -f "$FEED" ] || { log "no feed at $FEED — nothing to build"; exit 0; }

# Rebuild only when the feed is newer than the last output. sitemap.xml is the
# marker because build.js writes it last.
STAMP="$WEB_ROOT/sitemap.xml"
if [ -f "$STAMP" ] && [ ! "$FEED" -nt "$STAMP" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi

# Refuse to publish the placeholder fixture. build.js banners its own output, but
# this catches it a step earlier and leaves the live site untouched rather than
# replacing real pages with warning-banded ones. Case-insensitive: the fixture
# uses uppercase PLACEHOLDER ids.
if grep -qi 'example\.invalid\|placeholder' "$FEED" 2>/dev/null; then
  log "ERROR: feed contains placeholder records — refusing to build"
  exit 1
fi

TS=$(date +%Y%m%d%H%M%S)
STAGING="$WEB_ROOT/.staging-$TS"
trap 'rm -rf "$STAGING"' EXIT

mkdir -p "$STAGING" "$RELEASES"
node "$SITE_SRC/build.js" --feed "$FEED" --base "$BASE" --out "$STAGING"

# Promote. Renaming a symlink onto itself is atomic, so a request sees either
# the whole old release or the whole new one, never a partial tree. One release
# directory holds both generated trees, so deal/ and theme/ can't come from
# different builds (a theme page must link only to deal pages that exist).
mkdir -p "$RELEASES/$TS"
for d in deal theme; do
  mv "$STAGING/$d" "$RELEASES/$TS/$d"
done
chmod -R a+rX "$RELEASES/$TS"
for d in deal theme; do
  ln -sfn ".releases/$TS/$d" "$WEB_ROOT/.$d-next"
  mv -Tf "$WEB_ROOT/.$d-next" "$WEB_ROOT/$d"
done

# Same-filesystem renames, atomic per file.
for f in archive.html sitemap.xml; do
  if [ -f "$STAGING/$f" ]; then
    chmod a+r "$STAGING/$f"
    mv -f "$STAGING/$f" "$WEB_ROOT/$f"
  fi
done

# Caddy must be able to traverse the release dirs it serves through the symlink.
chmod a+rX "$RELEASES"

# Prune superseded releases, keeping a few for a fast manual rollback (repeat
# for theme):
#   ln -sfn .releases/<older>/deal /var/www/brickdeal/.deal-next
#   mv -Tf /var/www/brickdeal/.deal-next /var/www/brickdeal/deal
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

log "rebuilt -> .releases/$TS ($(ls -1 "$RELEASES/$TS/deal" | wc -l) deal pages, $(ls -1 "$RELEASES/$TS/theme" | wc -l) theme pages)"
