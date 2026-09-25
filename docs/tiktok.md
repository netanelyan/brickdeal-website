# TikTok integration

The TikTok app **BrickDeal** (Sandbox) uses Login Kit plus the Content Posting
API to put finished videos into the BrickDeal account's own TikTok **drafts**.
Nothing is ever posted publicly by code: a draft lands in the TikTok app's inbox,
and a human writes the caption and publishes it.

Scopes: `user.info.basic` (Login Kit) and `video.upload` (drafts only — not
`video.publish`).

## Pieces

| Path | Purpose |
|---|---|
| `server/tiktok.js` | The OAuth service. `GET /tiktok/login`, `/tiktok/callback`, `/tiktok/status`. node:http, loopback only, run by pm2. |
| `server/tiktok-client.js` | Token store, refresh, and `uploadVideoToTikTokDrafts()`. |
| `server/env.js` | Reads `.env`; the real process environment always wins. |
| `scripts/tiktok-upload-draft.js` | CLI wrapper around the upload helper. |
| `terms.html`, `privacy.html` | Served at `/terms` and `/privacy` — the URLs declared on the app. |
| `deploy/Caddyfile` | Proxies `/tiktok/*` to the service and serves the two legal pages on `www`. |

## Environment

Names only — values go in `.env` on the machine, never in the repo. `.env.example`
is the committed template; `.env` is gitignored.

```
TIKTOK_CLIENT_KEY          from developers.tiktok.com
TIKTOK_CLIENT_SECRET       server-side only; must never reach a browser or a log
TIKTOK_REDIRECT_URI        https://www.brickdealil.com/tiktok/callback
TIKTOK_VERIFIED_DOMAINS    empty in Sandbox (see "No PULL_FROM_URL" below)
```

Optional, with defaults: `TIKTOK_HOST` (127.0.0.1), `TIKTOK_PORT` (8791),
`TIKTOK_TOKEN_STORE` (`data/tiktok-tokens.json` in the repo).

The redirect URI has to match what is registered on the app character for
character, including the `www` and the trailing path with no slash.

## Connecting an account

1. Add the TikTok account as a **target user** on the app in the TikTok developer
   portal. In Sandbox, no other account can complete the flow.
2. Log into that account in the browser.
3. Visit <https://www.brickdealil.com/tiktok/login>.
4. Approve the two scopes on TikTok's screen. You land back on
   `/tiktok/callback`, which shows **TikTok connected ✓** and the granted scope.
5. `/tiktok/status` answers whether an account is currently connected.

What happens under the hood: `/tiktok/login` mints a random `state`, stores it in
an httpOnly + Secure + SameSite=Lax cookie scoped to `/tiktok` with a 10-minute
life, and redirects to TikTok. `/tiktok/callback` refuses with 400 unless the
returned `state` matches that cookie, then trades the `code` at
`https://open.tiktokapis.com/v2/oauth/token/` and writes the tokens to
`data/tiktok-tokens.json` (mode 600, outside the web root, gitignored). No token
is ever logged or displayed.

Tokens refresh themselves: `getValidTikTokToken()` renews through the same
endpoint with `grant_type=refresh_token` whenever less than five minutes are left,
and saves the result. If the *refresh* token has also expired, it says so — redo
the login above.

## Uploading a draft

```
node scripts/tiktok-upload-draft.js clip.mp4
```

It prints the `publish_id`. Then open TikTok on the connected account: the draft
is waiting in the inbox notification.

From code:

```js
const { uploadVideoToTikTokDrafts } = require('./server/tiktok-client.js');
const publishId = await uploadVideoToTikTokDrafts('/path/to/clip.mp4');
```

Chunking follows TikTok's rules: a file of 64MB or less goes up whole as one
chunk; anything larger is split into 10MB chunks with the last one absorbing the
remainder (so `total_chunk_count` is `floor(size / 10MB)`). Each chunk is PUT to
the `upload_url` from init with `Content-Type: video/mp4` and
`Content-Range: bytes <start>-<end>/<total>`.

### No PULL_FROM_URL

The init call always uses `source: FILE_UPLOAD`. `PULL_FROM_URL` requires the
source domain to be verified on the app, and ours is not — `TIKTOK_VERIFIED_DOMAINS`
is empty while the app is in Sandbox. Don't add it without verifying the domain
first, or the init call will simply be rejected.

## Deploying

The service runs from this repo at `/opt/brickdeal-site` on the VPS, under pm2,
listening on 127.0.0.1:8791. Caddy proxies `/tiktok/*` to it; everything else is
still static files out of `/var/www/brickdeal`.

First time:

```bash
cd /opt/brickdeal-site
git pull
npm install                      # no dependencies; this is just a no-op check

# .env is never in git — create it on the server, with the four values
cat > .env <<'EOF'
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://www.brickdealil.com/tiktok/callback
TIKTOK_VERIFIED_DOMAINS=
EOF
chmod 600 .env

pm2 start server/tiktok.js --name brickdeal-tiktok
pm2 save

# The two legal pages are hand-written static files: copy them like the others
cp terms.html privacy.html /var/www/brickdeal/

# Caddy
cp deploy/Caddyfile /etc/caddy/Caddyfile      # diff first if the live file may have drifted
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Subsequent deploys:

```bash
cd /opt/brickdeal-site
git pull
npm install
cp terms.html privacy.html /var/www/brickdeal/
pm2 restart brickdeal-tiktok --update-env
systemctl reload caddy                        # only if deploy/Caddyfile changed
```

Checks:

```bash
curl -sI https://www.brickdealil.com/terms   | head -1   # 200, no redirect
curl -sI https://www.brickdealil.com/privacy | head -1   # 200, no redirect
curl -sI https://www.brickdealil.com/tiktok/login        # 302 to www.tiktok.com/v2/auth/authorize/
pm2 logs brickdeal-tiktok --lines 20
```

`/tiktok/login` must answer 302 with a `Location` carrying `client_key`,
`scope=user.info.basic,video.upload`, `response_type=code`, the URL-encoded
`redirect_uri` and a `state`, plus a `Set-Cookie` for `tiktok_oauth_state`.

## Deleting the stored data

`privacy.html` promises deletion on request. That is one command:

```bash
rm -f /opt/brickdeal-site/data/tiktok-tokens.json
```

The account owner can also revoke access from TikTok's own security settings,
which invalidates the tokens on TikTok's side.
