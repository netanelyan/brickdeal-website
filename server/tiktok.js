#!/usr/bin/env node
'use strict';
/**
 * The only server-side piece of brickdealil.com: the TikTok OAuth handshake.
 *
 *   GET /tiktok/login      mints a state, sets it in a cookie, redirects to TikTok
 *   GET /tiktok/callback    verifies the state, trades the code for tokens
 *   GET /tiktok/status      whether an account is connected (no tokens shown)
 *
 * Everything else the site serves is a static file out of /var/www/brickdeal, so
 * Caddy proxies only /tiktok/* here (see deploy/Caddyfile) and this listens on
 * loopback. The client secret lives in the environment and never leaves this
 * process; no part of the flow runs in the browser beyond the two redirects.
 *
 * node:http rather than Express, because nothing in this repo has a dependency
 * and three routes do not justify starting.
 *
 * Run:  node server/tiktok.js            (reads .env next to this repo)
 *       pm2 start server/tiktok.js --name brickdeal-tiktok
 */

const crypto = require('crypto');
const http = require('http');

const { loadEnv, required } = require('./env.js');
const { exchangeCodeForTokens, readTokens } = require('./tiktok-client.js');

loadEnv();

const HOST = process.env.TIKTOK_HOST || '127.0.0.1';
const PORT = Number(process.env.TIKTOK_PORT || 8791);

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
/* user.info.basic comes with Login Kit; video.upload is what puts a video in the
   account owner's drafts. Nothing here needs video.publish. */
const SCOPES = 'user.info.basic,video.upload';

const STATE_COOKIE = 'tiktok_oauth_state';
const STATE_TTL_S = 600;

const log = (...parts) => console.log('[tiktok]', ...parts);

/* ---------------------------------------------------------------- responses */

/* These pages are for whoever is connecting the account — one person, us — but
   they are on the public domain, so they use the site's stylesheet and say as
   little as possible. English and LTR: they are read by the TikTok reviewer too. */
function page({ title, heading, body }) {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | BrickDeal</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/assets/brand/favicon/favicon.ico" sizes="32x32">
<link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
<main>
  <div class="wrap">
    <article class="prose">
      <h1>${heading}</h1>
      ${body}
    </article>
  </div>
</main>
</body>
</html>
`;
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function send(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function errorPage(res, status, heading, detail) {
  send(res, status, page({
    title: 'TikTok connection failed',
    heading,
    body: `<p>${escapeHtml(detail)}</p>
      <p>Nothing was saved. You can <a href="/tiktok/login">start again</a>.</p>`,
  }));
}

/* ------------------------------------------------------------------ cookies */

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/* Scoped to /tiktok so it is never sent with a request for a page or an asset.
   Secure is unconditional: the only way in is through Caddy over HTTPS. */
const stateCookie = (value) =>
  `${STATE_COOKIE}=${value}; Path=/tiktok; Max-Age=${STATE_TTL_S}; HttpOnly; Secure; SameSite=Lax`;

const clearedStateCookie = () =>
  `${STATE_COOKIE}=; Path=/tiktok; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function sameState(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/* ------------------------------------------------------------------- routes */

function login(res) {
  const state = crypto.randomBytes(16).toString('hex');

  /* Built by hand rather than with URLSearchParams so the comma between the two
     scopes stays a literal comma, which is the form TikTok documents. */
  const url = `${AUTHORIZE_URL}?client_key=${encodeURIComponent(required('TIKTOK_CLIENT_KEY'))}`
    + `&scope=${SCOPES}`
    + '&response_type=code'
    + `&redirect_uri=${encodeURIComponent(required('TIKTOK_REDIRECT_URI'))}`
    + `&state=${state}`;

  res.writeHead(302, {
    Location: url,
    'Set-Cookie': stateCookie(state),
    'Cache-Control': 'no-store',
  });
  res.end();
}

async function callback(req, res, url) {
  const q = url.searchParams;

  /* One state, one callback: drop the cookie whatever happens next, so a replay
     of this URL cannot pass the check a second time. send() writes its headers
     with writeHead, which merges rather than replaces this one. */
  res.setHeader('Set-Cookie', clearedStateCookie());

  /* The user pressed Cancel, or TikTok refused the request outright. */
  const error = q.get('error');
  if (error) {
    log('authorization declined:', error);
    return errorPage(res, 400, 'TikTok did not authorise the app',
      q.get('error_description') || error);
  }

  if (!sameState(q.get('state'), cookies(req)[STATE_COOKIE])) {
    log('state mismatch — refusing the callback');
    return errorPage(res, 400, 'State mismatch',
      'The state parameter did not match the cookie from /tiktok/login. '
      + 'The link may be more than 10 minutes old, or it was not started here.');
  }

  const code = q.get('code');
  if (!code) return errorPage(res, 400, 'Missing code', 'TikTok sent no authorization code.');

  try {
    const { scope } = await exchangeCodeForTokens(code);
    log('account connected; scope:', scope || '(none reported)');

    return send(res, 200, page({
      title: 'TikTok connected',
      heading: 'TikTok connected ✓',
      body: `<p>BrickDeal can now upload videos to this account's TikTok drafts.</p>
        <p>Granted scope: <strong>${escapeHtml(scope || '')}</strong></p>
        <p>Nothing has been posted. Uploaded videos land in the account's drafts in the
          TikTok app, where they are reviewed and published by hand.</p>`,
    }));
  } catch (err) {
    /* err.message is built in tiktok-client.js from the status and error code
       only, so this cannot print a token. */
    log('token exchange failed:', err.message);
    return errorPage(res, 502, 'Token exchange failed', err.message);
  }
}

function status(res) {
  const tokens = readTokens();
  send(res, 200, page({
    title: 'TikTok status',
    heading: tokens ? 'TikTok account connected' : 'No TikTok account connected',
    body: tokens
      ? `<p>Scope: <strong>${escapeHtml(tokens.scope || '')}</strong></p>
         <p><a href="/tiktok/login">Reconnect</a></p>`
      : '<p><a href="/tiktok/login">Connect an account</a></p>',
  }));
}

/* --------------------------------------------------------------------- wire */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  try {
    switch (url.pathname) {
      case '/tiktok/login':
        return login(res);
      case '/tiktok/callback':
        return void callback(req, res, url).catch((err) => {
          log('callback crashed:', err.message);
          if (!res.headersSent) errorPage(res, 500, 'Something went wrong', err.message);
        });
      case '/tiktok/status':
        return status(res);
      default:
        return send(res, 404, page({
          title: 'Not found',
          heading: 'Not found',
          body: '<p>Nothing here. The TikTok routes are /tiktok/login and /tiktok/callback.</p>',
        }));
    }
  } catch (err) {
    log('request failed:', err.message);
    if (!res.headersSent) errorPage(res, 500, 'Something went wrong', err.message);
    return undefined;
  }
});

server.listen(PORT, HOST, () => {
  /* Names only. A startup line is the classic place a secret ends up in a log. */
  log(`listening on http://${HOST}:${PORT} — redirect_uri ${process.env.TIKTOK_REDIRECT_URI || '(unset!)'}`);
});
