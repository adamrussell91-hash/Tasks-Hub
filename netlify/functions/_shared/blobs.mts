import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore, type Store } from '@netlify/blobs';
import * as keys from '../../../src/storage/keys.ts';
import {
  createTasksStore,
  seedIfEmpty,
  type KvAdapter
} from '../../../src/services/store.ts';
import type { SeedData } from '../../../src/services/types.ts';

export { keys };

const CONTENT_STORE_NAME = 'tasks-hub-content';

/**
 * Netlify esbuild places the handler at `/var/task/netlify/functions/*.mjs`.
 * `included_files` (fixtures/seed.json) land under `process.cwd()` (`/var/task`).
 * Walking `../../..` from the handler incorrectly resolves to `/var/fixtures/...`.
 */
export function loadSeed(): SeedData {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), 'fixtures/seed.json'),
    join(here, '../../fixtures/seed.json'),
    join(here, '../../../fixtures/seed.json'),
    join(here, '../../../../fixtures/seed.json')
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    return JSON.parse(readFileSync(path, 'utf8')) as SeedData;
  }
  throw new Error(`fixtures/seed.json not found (cwd=${process.cwd()}; tried ${candidates.join(', ')})`);
}

export function getContentStore(): Store {
  return getStore(CONTENT_STORE_NAME);
}

export async function getJSON<T = unknown>(store: Store, key: string): Promise<T | null> {
  return (await store.get(key, { type: 'json' })) as T | null;
}

export async function setJSON(store: Store, key: string, value: unknown): Promise<void> {
  await store.setJSON(key, value);
}

export async function deleteBlob(store: Store, key: string): Promise<void> {
  await store.delete(key);
}

export function blobKv(store: Store = getContentStore()): KvAdapter {
  return {
    getJSON: (key) => getJSON(store, key),
    setJSON: (key, value) => setJSON(store, key, value),
    delete: (key) => deleteBlob(store, key)
  };
}

let seedPromise: Promise<void> | null = null;

export function resetSeedCache(): void {
  seedPromise = null;
}

/** Idempotent Blobs seed on first Functions touch (meta/seeded marker). */
async function ensureSeeded(kv: KvAdapter = blobKv()): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedIfEmpty(kv, keys, loadSeed()).catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}

export async function getTasksStore() {
  const kv = blobKv();
  await ensureSeeded(kv);
  return createTasksStore(kv, keys);
}
