import { getHubSession } from './_shared/session.mts';
import { getTasksStore } from './_shared/blobs.mts';
import { searchEntities } from '../../src/domain/queries.ts';
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

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'GET') return withCors(methodNotAllowed('GET, OPTIONS'), request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getHubSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthenticated', 'Sign in required'), request, env);
  }

  const q = new URL(request.url).searchParams.get('q') ?? '';
  const store = getTasksStore();
  const [tasks, projects] = await Promise.all([store.listTasks(), store.listProjects()]);
  return withCors(okResponse(200, searchEntities(tasks, projects, q)), request, env);
}

export const config = { path: '/api/search' };
