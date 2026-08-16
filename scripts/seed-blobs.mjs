#!/usr/bin/env node
/**
 * Seed Netlify Blobs from fixtures/seed.json.
 * Requires NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN (or NETLIFY_API_TOKEN).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import * as keys from '../src/storage/keys.ts';
import { seedIfEmpty } from '../src/services/store.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(join(root, 'fixtures/seed.json'), 'utf8'));

const store = getStore('tasks-hub-content');
const kv = {
  getJSON: async (key) => (await store.get(key, { type: 'json' })) ?? null,
  setJSON: async (key, value) => {
    await store.setJSON(key, value);
  },
  delete: async (key) => {
    await store.delete(key);
  }
};

await seedIfEmpty(kv, keys, seed);
console.log('seed-blobs: tasks-hub-content seeded (or already marked seeded)');
