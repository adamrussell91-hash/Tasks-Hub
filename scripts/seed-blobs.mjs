#!/usr/bin/env node
/**
 * Seed Netlify Blobs from fixtures/seed.json.
 * Requires NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN (or NETLIFY_API_TOKEN).
 *
 * Usage:
 *   node scripts/seed-blobs.mjs           # seed only if meta/seeded missing
 *   FORCE_SEED=1 node scripts/seed-blobs.mjs  # wipe marker and re-seed indexes
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import * as keys from '../src/storage/keys.ts';
import { seedIfEmpty } from '../src/services/store.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(join(root, 'fixtures/seed.json'), 'utf8'));

const siteID = process.env.NETLIFY_SITE_ID;
const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN;
if (!siteID || !token) {
  console.error(
    'seed-blobs: set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN (site artasks-hub).'
  );
  process.exit(1);
}

const store = getStore({ name: 'tasks-hub-content', siteID, token });
const kv = {
  getJSON: async (key) => (await store.get(key, { type: 'json' })) ?? null,
  setJSON: async (key, value) => {
    await store.setJSON(key, value);
  },
  delete: async (key) => {
    await store.delete(key);
  }
};

if (process.env.FORCE_SEED === '1') {
  await kv.delete(keys.metaSeededKey());
  console.log('seed-blobs: cleared meta/seeded (FORCE_SEED=1)');
}

await seedIfEmpty(kv, keys, seed);
console.log('seed-blobs: tasks-hub-content seeded (or already marked seeded)');
