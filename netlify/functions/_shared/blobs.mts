import { getStore, type Store } from '@netlify/blobs';
import * as keys from '../../../src/storage/keys.ts';
import { createTasksStore, type KvAdapter } from '../../../src/services/store.ts';

export { keys };

const CONTENT_STORE_NAME = 'tasks-hub-content';

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

export function getTasksStore() {
  return createTasksStore(blobKv(), keys);
}
