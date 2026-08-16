import { getHubSession } from './_shared/session.mts';
import { getTasksStore } from './_shared/blobs.mts';
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
  if (request.method !== 'GET' && request.method !== 'POST') {
    return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
  }

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const session = getHubSession(request, env);
  if (!session.authenticated) {
    return withCors(errorResponse(401, 'unauthenticated', 'Sign in required'), request, env);
  }

  const store = await getTasksStore();
  const url = new URL(request.url);

  try {
    if (request.method === 'GET') {
      const projectId = url.searchParams.get('project_id');
      if (projectId) {
        const variance = await store.getProjectVariance(projectId);
        return withCors(okResponse(200, { variance }), request, env);
      }
      const reviews = await store.listReviewLogs();
      return withCors(okResponse(200, { reviews }), request, env);
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'close') {
      const result = await store.closeProject({
        project_id: String(body.project_id),
        reason: String(body.reason ?? '')
      });
      return withCors(okResponse(200, result), request, env);
    }

    return withCors(errorResponse(400, 'unknown_action', 'Unknown reviews action'), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = { path: '/api/reviews' };
