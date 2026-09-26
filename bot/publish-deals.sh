#!/usr/bin/env bash
#
# Publishing — approach A: push data/deals.json from the private bot repo
# straight into the public site repo. One moving part, live within the hour.
#
# Drop in at: scripts/publish-deals.sh  (chmod +x)
# Schedule hourly, offset from the refresh job:
#   43 * * * *  cd /opt/brickdeal-automation && ./scripts/publish-deals.sh >> logs/publish.log 2>&1
#
# .env (never committed):
#   SITE_REPO=netanelyan/brickdeal-site
#   SITE_TOKEN=github_pat_...   # fine-grained PAT, Contents: read+write, THIS REPO ONLY
#
# The token is write-scoped to one public repo holding a regenerable file, so a
# leak costs a force-push revert — not the bot, not the AliExpress credentials.
# Rotate it if the VPS is ever compromised.

set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a

: "${SITE_REPO:?SITE_REPO not set}"
: "${SITE_TOKEN:?SITE_TOKEN not set}"

FEED="data/deals.json"   # written by src/deals.js
WORK="${WORK:-/tmp/brickdeal-site}"

if [ ! -s "$FEED" ]; then
  echo "$(date -Is) feed missing or empty, refusing to publish"
  exit 1
fi

# Never push a feed we can't parse — a broken deals.json takes the site down.
node -e 'const d=require("./data/deals.json"); if(!Array.isArray(d)||!d.length) throw new Error("feed is not a non-empty array"); console.log("feed ok:",d.length,"deals")'

if [ -d "$WORK/.git" ]; then
  git -C "$WORK" remote set-url origin "https://x-access-token:${SITE_TOKEN}@github.com/${SITE_REPO}.git"
  git -C "$WORK" fetch --quiet origin
  git -C "$WORK" reset --quiet --hard origin/HEAD
else
  rm -rf "$WORK"
  git clone --quiet --depth 1 "https://x-access-token:${SITE_TOKEN}@github.com/${SITE_REPO}.git" "$WORK"
fi

# The site fetches ./deals.json from the repo root.
cp "$FEED" "$WORK/deals.json"

# Feed unchanged since the last run — skip the commit rather than pile up noise.
if git -C "$WORK" diff --quiet -- deals.json; then
  echo "$(date -Is) no change, skipping"
  exit 0
fi

# Regenerate the static deal pages, archive and sitemap from the new feed.
( cd "$WORK" && node build.js --base "${SITE_BASE:-https://brickdeal.co.il}" )

COUNT=$(node -e 'console.log(require("./data/deals.json").filter(d=>!d.dead).length)')

git -C "$WORK" add -A -- deals.json deal archive.html sitemap.xml
git -C "$WORK" -c user.name="brickdeal-bot" -c user.email="bot@brickdeal.local" \
    commit --quiet -m "feed: ${COUNT} live deals"
git -C "$WORK" push --quiet origin HEAD

echo "$(date -Is) published ${COUNT} deals to ${SITE_REPO}"
