'use strict';
/**
 * The TikTok side of the integration: token storage, refresh, and pushing a
 * video file into the connected account's own TikTok drafts (the "inbox").
 *
 * Two things are deliberate here.
 *
 *   FILE_UPLOAD, never PULL_FROM_URL. PULL_FROM_URL needs the source domain
 *   verified on the app; ours is not (TIKTOK_VERIFIED_DOMAINS is empty while the
 *   app is in Sandbox), so the bytes are PUT from here.
 *
 *   Nothing logs or returns a token. The store file holds them, callers get an
 *   access token to pass straight to fetch, and every error message carries the
 *   HTTP status and TikTok's error code — never a response body, which on this
 *   endpoint contains the tokens themselves.
 *
 * Node 18+ for global fetch. No dependencies.
 */

const fs = require('fs');
const path = require('path');

const { required } = require('./env.js');

const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/';
const INBOX_INIT_ENDPOINT = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';

/* TikTok's chunking rules for FILE_UPLOAD: a file of 64MB or less goes up whole
   as a single chunk, and a chunked upload uses 5–64MB chunks with the final one
   absorbing the remainder (so total_chunk_count is a floor, not a ceiling).
   10MB keeps a retry cheap on a VPS uplink. */
const WHOLE_FILE_MAX = 64 * 1024 * 1024;
const CHUNK_SIZE = 10 * 1024 * 1024;

/* Refresh this far ahead of expiry, so a token handed out here cannot expire
   mid-upload. */
const REFRESH_MARGIN_S = 5 * 60;

/* Outside the web root: this repo is not what Caddy serves (/var/www/brickdeal
   is), and data/ is gitignored. Resolved lazily so .env can be loaded after
   this module is required. */
function storePath() {
  return process.env.TIKTOK_TOKEN_STORE || path.join(__dirname, '..', 'data', 'tiktok-tokens.json');
}

function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/* tmp + rename, like the bot does with the feed: a reader can only ever see a
   whole file. Mode 600 on both, or the tmp file would be the leak. */
function saveTokens(tokens) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });

  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600); // an existing file keeps its own mode through rename
  return tokens;
}

/* Only the fields we use, so an unexpected extra in the response never lands in
   the store. obtained_at is epoch seconds, matching expires_in's unit. */
function shapeTokens(body) {
  return {
    open_id: body.open_id,
    scope: body.scope,
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_in: body.expires_in,
    refresh_expires_in: body.refresh_expires_in,
    obtained_at: Math.floor(Date.now() / 1000),
  };
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams(params).toString(),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.access_token) {
    const code = body && (body.error || body.error_description);
    throw new Error(`TikTok token endpoint failed (HTTP ${res.status}${code ? `: ${code}` : ''})`);
  }
  return body;
}

/**
 * Trades an authorization code for tokens and stores them. Returns the account
 * identity only — the caller has no use for the tokens and must not see them.
 */
async function exchangeCodeForTokens(code) {
  const tokens = shapeTokens(await tokenRequest({
    client_key: required('TIKTOK_CLIENT_KEY'),
    client_secret: required('TIKTOK_CLIENT_SECRET'),
    code,
    grant_type: 'authorization_code',
    redirect_uri: required('TIKTOK_REDIRECT_URI'),
  }));

  saveTokens(tokens);
  return { open_id: tokens.open_id, scope: tokens.scope };
}

const secondsLeft = (tokens) =>
  (Number(tokens.obtained_at) || 0) + (Number(tokens.expires_in) || 0) - Math.floor(Date.now() / 1000);

const refreshSecondsLeft = (tokens) =>
  (Number(tokens.obtained_at) || 0) + (Number(tokens.refresh_expires_in) || 0) - Math.floor(Date.now() / 1000);

/**
 * The access token to use right now, refreshing first when less than five
 * minutes are left on it. Throws when no account is connected or the refresh
 * token has expired too — both mean someone has to visit /tiktok/login again.
 */
async function getValidTikTokToken() {
  const tokens = readTokens();
  if (!tokens || !tokens.access_token) {
    throw new Error('no TikTok account connected — visit /tiktok/login first');
  }

  if (secondsLeft(tokens) > REFRESH_MARGIN_S) return tokens.access_token;

  if (!tokens.refresh_token || refreshSecondsLeft(tokens) <= 0) {
    throw new Error('TikTok refresh token has expired — reconnect at /tiktok/login');
  }

  const refreshed = shapeTokens(await tokenRequest({
    client_key: required('TIKTOK_CLIENT_KEY'),
    client_secret: required('TIKTOK_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  }));

  /* A refresh response omits open_id; keep the one we already have so the store
     never loses the identity of the connected account. */
  if (!refreshed.open_id) refreshed.open_id = tokens.open_id;

  saveTokens(refreshed);
  return refreshed.access_token;
}

/**
 * Byte ranges to PUT, and the init values that describe them. Exported for the
 * sake of being testable without a network.
 */
function planChunks(videoSize) {
  if (videoSize <= WHOLE_FILE_MAX) {
    return { chunkSize: videoSize, totalChunkCount: 1, chunks: [{ start: 0, end: videoSize - 1 }] };
  }

  const totalChunkCount = Math.floor(videoSize / CHUNK_SIZE);
  const chunks = [];
  for (let i = 0; i < totalChunkCount; i += 1) {
    const start = i * CHUNK_SIZE;
    /* Last chunk takes whatever is left over, which is why the count is a floor
       and the final range can exceed chunkSize. */
    const end = i === totalChunkCount - 1 ? videoSize - 1 : start + CHUNK_SIZE - 1;
    chunks.push({ start, end });
  }
  return { chunkSize: CHUNK_SIZE, totalChunkCount, chunks };
}

/**
 * Uploads a local .mp4 into the connected account's TikTok drafts and returns
 * the publish_id. Nothing is posted publicly: the inbox endpoint only puts the
 * video in the account owner's drafts, where they finish and publish it in the
 * TikTok app themselves.
 */
async function uploadVideoToTikTokDrafts(filePath, { onProgress } = {}) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`${filePath} is not a non-empty file`);
  }

  const videoSize = stat.size;
  const plan = planChunks(videoSize);
  const accessToken = await getValidTikTokToken();

  const initRes = await fetch(INBOX_INIT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
      },
    }),
  });

  const initBody = await initRes.json().catch(() => null);
  const data = initBody && initBody.data;
  const err = initBody && initBody.error;
  if (!initRes.ok || !data || !data.upload_url || !data.publish_id) {
    const code = err && (err.code || err.message) ? `: ${err.code || ''} ${err.message || ''}`.trimEnd() : '';
    throw new Error(`TikTok inbox init failed (HTTP ${initRes.status}${code})`);
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    for (let i = 0; i < plan.chunks.length; i += 1) {
      const { start, end } = plan.chunks[i];
      const length = end - start + 1;
      const buf = Buffer.allocUnsafe(length);
      fs.readSync(fd, buf, 0, length, start);

      const putRes = await fetch(data.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(length),
          'Content-Range': `bytes ${start}-${end}/${videoSize}`,
        },
        body: buf,
      });
      if (!putRes.ok) {
        throw new Error(`chunk ${i + 1}/${plan.chunks.length} upload failed (HTTP ${putRes.status})`);
      }
      if (onProgress) onProgress(i + 1, plan.chunks.length);
    }
  } finally {
    fs.closeSync(fd);
  }

  return data.publish_id;
}

module.exports = {
  exchangeCodeForTokens,
  getValidTikTokToken,
  planChunks,
  readTokens,
  uploadVideoToTikTokDrafts,
};
