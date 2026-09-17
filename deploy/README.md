# Deployment

The site is served by Caddy from `/var/www/brickdeal/` on the same VPS that runs
the bot, at https://brickdealil.com. This replaces the GitHub Pages approach the
root README still describes — see "Superseded" below.

## Layout on the server

```
/opt/brickdeal-site/        this repo — the source
/var/www/brickdeal/         the served root
  index.html, assets/, robots.txt   copied from the source
  favicon.ico                       copied from the source — see note below
  deals.json                        written by the bot on each post
  deal/ -> .releases/<ts>/          symlink, swapped atomically per build
  archive.html, sitemap.xml         generated
  .releases/, .staging-*            hidden from Caddy by `hide .*`
```

The bot writes `deals.json` straight into the web root (`DEALS_PATH` in its
`.env`), atomically, only after a deal has actually posted to the channel.

### favicon.ico at the root

Every page declares its icons explicitly (`assets/brand/favicon/`), so browsers
never need the root file. It is there for the clients that skip the markup and
request `/favicon.ico` directly — feed readers, link scrapers, some crawlers. It
has to be copied alongside `index.html`; it is not covered by copying `assets/`.

## Files here

| File | Installs to | Purpose |
|---|---|---|
| `Caddyfile` | `/etc/caddy/Caddyfile` | TLS for apex + www, www 301s to apex |
| `brickdeal-build.sh` | `/usr/local/bin/` | Regenerates deal pages, archive, sitemap |
| `brickdeal-build.{service,timer}` | `/etc/systemd/system/` | Runs the above every 2 min |
| `brickdeal-refresh.{service,timer}` | `/etc/systemd/system/` | Nightly price re-check (03:17) |

`brickdeal-refresh.service` runs `scripts/refresh-deals.js` from the **bot**
repo, not this one.

## Why a timer and not a hook on each feed write

`build.js` rewrites every deal page per run, so calling it from the bot's
posting path would couple channel delivery to a full-directory rebuild. A timer
is also self-healing: a missed run, a crash mid-build, or a feed write landing
during a build all resolve on the next tick. The script exits immediately unless
`deals.json` is newer than `sitemap.xml`, so idle ticks cost nothing.

Builds are atomic. `build.js` unlinks every existing page before writing new
ones, so building straight into the live root would leave a window where every
deal page 404s. The wrapper builds into `.staging-<ts>/` and promotes by
renaming a symlink.

## www redirect

`www.brickdealil.com` is a separate site block rather than a matcher inside the
main one, so Caddy still obtains a certificate for it. Folding it in would hand
`https://www.…` a TLS error *before* the redirect could fire — exactly the split
the redirect exists to prevent.

## Superseded

`bot/publish-deals.sh` and the `SITE_REPO` / `SITE_TOKEN` variables implement the
earlier GitHub Pages model: commit the feed to a public repo and serve it from
Pages. Self-hosting replaces that entirely. Do not run both — they would be two
writers against one feed.
