'use strict';
/**
 * .env reader. No dependency: nothing else in this repo has one, and a config
 * loader is not the place to start — the format we need is KEY=VALUE lines.
 *
 * The real process environment always wins over the file, so `pm2 restart
 * brickdeal-tiktok --update-env` and a systemd EnvironmentFile both override it
 * without the file having to be edited or removed.
 */

const fs = require('fs');
const path = require('path');

/* Repo root, one level up from server/. Overridable so a deploy can keep the
   file somewhere else entirely. */
const ENV_FILE = process.env.TIKTOK_ENV_FILE || path.join(__dirname, '..', '.env');

/** Returns true if a file was found and read, false if there simply isn't one. */
function loadEnv(file = ENV_FILE) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    /* Quotes are stripped when they wrap the whole value — a secret that ends
       in a stray quote is a worse failure than one that keeps a literal one. */
    if (value.length > 1 && /^".*"$|^'.*'$/.test(value)) value = value.slice(1, -1);

    if (!key || key in process.env) continue;
    process.env[key] = value;
  }
  return true;
}

/**
 * Reads a variable that the caller cannot work without. Throws with the name
 * only — never the value, since the callers here handle the client secret.
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — copy .env.example to .env and fill it in`);
  }
  return value;
}

module.exports = { ENV_FILE, loadEnv, required };
