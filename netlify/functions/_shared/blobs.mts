import { getStore, type Store } from '@netlify/blobs';
import * as keys from '../../../src/storage/keys.ts';
import {
  createTasksStore,
  seedIfEmpty,
  type KvAdapter
} from '../../../src/services/store.ts';
import type { SeedData } from '../../../src/services/types.ts';
import seedFixture from '../../../fixtures/seed.json';

export { keys };

const CONTENT_STORE_NAME = 'tasks-hub-content';

/**
 * Prefer the bundled fixture (esbuild inlines JSON) so Netlify Functions do not
 * depend on included_files path layout under `/var/task`.
 */
export function loadSeed(): SeedData {
  const seed = seedFixture as SeedData;
  if (!seed.tasks?.length) {
    throw new Error('bundled fixtures/seed.json has no tasks — refusing to seed');
  }
  return seed;
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
