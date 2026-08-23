import { getHubSession } from './_shared/session.mts';
import { getTasksStore, keys, blobKv, resetSeedCache, loadSeed } from './_shared/blobs.mts';
import { seedIfEmpty } from '../../src/services/store.ts';
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
    return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const force = Boolean(body.force);
    const seed = loadSeed();
    const kv = blobKv();
    resetSeedCache();
    await seedIfEmpty(kv, keys, seed, { force });
    resetSeedCache();
    const store = await getTasksStore();
    const [tasks, projects, programs] = await Promise.all([
      store.listTasks(),
      store.listProjects(),
      store.listPrograms()
    ]);
    return withCors(
      okResponse(200, {
        seeded: true,
        forced: force,
        loaded_task_count: seed.tasks.length,
        loaded_project_count: seed.projects.length,
        loaded_program_count: seed.programs?.length ?? 0,
        task_count: tasks.length,
        project_count: projects.length,
        program_count: programs.length
      }),
      request,
      env
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed';
    return withCors(errorResponse(500, 'seed_failed', message), request, env);
  }
}

export const config = { path: '/api/seed' };
