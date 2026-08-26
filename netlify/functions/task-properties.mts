import { getHubSession } from './_shared/session.mts';
import { getTasksStore } from './_shared/blobs.mts';
import { TaskPropertyConfigSchema } from '../../src/schemas/task-properties.ts';
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

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getHubSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthenticated', 'Sign in required'), request, env);
  }

  const store = await getTasksStore();

  try {
    if (request.method === 'GET') {
      const config = await store.getTaskProperties();
      return withCors(okResponse(200, config), request, env);
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const parsed = TaskPropertyConfigSchema.parse(body);
      const config = await store.updateTaskProperties(parsed);
      return withCors(okResponse(200, config), request, env);
    }

    return withCors(methodNotAllowed('GET, PUT, OPTIONS'), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = { path: '/api/task-properties' };
