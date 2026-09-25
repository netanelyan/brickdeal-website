#!/usr/bin/env node
'use strict';
/**
 * Uploads a local .mp4 into the connected TikTok account's drafts.
 *
 *   node scripts/tiktok-upload-draft.js clip.mp4
 *
 * Nothing is published: the video appears in the account's drafts in the TikTok
 * app (Profile → the inbox notification), and a human writes the caption and
 * posts it. Connect an account first at https://www.brickdealil.com/tiktok/login.
 */

const path = require('path');

const { loadEnv } = require('../server/env.js');
const { uploadVideoToTikTokDrafts } = require('../server/tiktok-client.js');

loadEnv();

const file = process.argv[2];
if (!file || file === '--help' || file === '-h') {
  console.error('usage: node scripts/tiktok-upload-draft.js <file.mp4>');
  process.exit(1);
}

uploadVideoToTikTokDrafts(path.resolve(file), {
  onProgress: (done, total) => {
    if (total > 1) console.log(`[tiktok] chunk ${done}/${total} uploaded`);
  },
})
  .then((publishId) => {
    console.log(`[tiktok] uploaded — publish_id ${publishId}`);
    console.log('[tiktok] open TikTok on the connected account; the draft is in the inbox.');
  })
  .catch((err) => {
    console.error(`[tiktok] ${err.message}`);
    process.exitCode = 1;
  });
