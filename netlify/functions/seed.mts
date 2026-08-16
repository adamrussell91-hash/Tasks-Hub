import { getHubSession } from './_shared/session.mts';
import { getTasksStore, keys, blobKv } from './_shared/blobs.mts';
import { seedIfEmpty } from '../../src/services/store.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SeedData } from '../../src/services/types.ts';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  methodNotAllowed,
  misconfiguredResponse,
  okResponse,
  preflightResponse,
  withCors
} from './_shared/http.mts';

function loadSeed(): SeedData {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  return JSON.parse(readFileSync(join(root, 'fixtures/seed.json'), 'utf8')) as SeedData;
}

/** Authenticated seed / re-seed of Blobs from fixtures/seed.json. */
export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getHubSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthenticated', 'Sign in required'), request, env);
  }

  if (request.method !== 'POST') {
    return withCors(methodNotAllowed(['POST', 'OPTIONS']), request, env);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const kv = blobKv();
    if (body.force) {
      await kv.delete(keys.metaSeededKey());
    }
    await seedIfEmpty(kv, keys, loadSeed());
    const store = await getTasksStore();
    const [tasks, projects] = await Promise.all([store.listTasks(), store.listProjects()]);
    return withCors(
      okResponse(200, {
        seeded: true,
        forced: Boolean(body.force),
        task_count: tasks.length,
        project_count: projects.length
      }),
      request,
      env
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed';
    return withCors(errorResponse(500, 'seed_failed', message), request, env);
  }
}
