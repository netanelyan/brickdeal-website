# Deployment

The site is served by Caddy from `/var/www/brickdeal/` on the same VPS that runs
the bot, at https://brickdealil.com. This replaces the GitHub Pages approach the
root README still describes — see "Superseded" below.

## Layout on the server

```
/opt/brickdeal-site/        this repo — the source, and the TikTok service pm2 runs
/var/www/brickdeal/         the served root
  index.html, guide.html, how-it-works.html, terms.html, privacy.html,
  assets/, robots.txt               copied from the source
  favicon.ico                       copied from the source — see note below
  deals.json                        written by the bot on each post
  deal/  -> .releases/<ts>/deal/    symlink, swapped atomically per build
  theme/ -> .releases/<ts>/theme/   symlink, same release as deal/
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
| `Caddyfile` | `/etc/caddy/Caddyfile` | TLS for apex + www; www 301s to apex except `/tiktok/*`, `/terms`, `/privacy` |
| `brickdeal-build.sh` | `/usr/local/bin/` | Regenerates deal pages, theme pages, archive, sitemap |
| `brickdeal-build.{service,timer}` | `/etc/systemd/system/` | Runs the above every 2 min |
| `brickdeal-refresh.{service,timer}` | `/etc/systemd/system/` | Nightly price re-check (03:17) |

`brickdeal-refresh.service` runs `scripts/refresh-deals.js` from the **bot**
repo, not this one.

## The TikTok service

`server/tiktok.js` is the one dynamic thing on the domain: the OAuth handshake for
the TikTok app, under pm2 on 127.0.0.1:8791, with Caddy proxying `/tiktok/*` to
it. It reads its credentials from `/opt/brickdeal-site/.env`, which is not in git.
Setup, connection and upload steps: [`../docs/tiktok.md`](../docs/tiktok.md).

```
pm2 start server/tiktok.js --name brickdeal-tiktok   # first time, then pm2 save
pm2 restart brickdeal-tiktok --update-env            # after a deploy
```

## Static pages are copied, not built

`index.html`, `guide.html`, `how-it-works.html`, `terms.html` and `privacy.html`
are hand-written and never touched by `build.js`. After editing any of them (or
anything in `assets/`), copy it to the web root yourself — the build timer will
not do it:

```
cp /opt/brickdeal-site/{index.html,guide.html,how-it-works.html,terms.html,privacy.html,robots.txt,favicon.ico} /var/www/brickdeal/
cp -r /opt/brickdeal-site/assets /var/www/brickdeal/
```

`terms.html` and `privacy.html` are served at the extensionless `/terms` and
`/privacy` — the URLs the TikTok app declares — via a `rewrite` in the Caddyfile.
They are the two English pages on an otherwise Hebrew site, because the audience
for them is the app reviewer.

`sitemap.xml` lists the static pages via `STATIC_PAGES` in `build.js`, so a
new static page needs an entry there too or crawlers won't be told about it.

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
