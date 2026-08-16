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

  const store = await getTasksStore();
  const url = new URL(request.url);
  const publicToken = url.searchParams.get('token');

  try {
    // Corey share link — no session; token proves access. Payload has no task titles.
    if (request.method === 'GET' && publicToken) {
      const view = await store.getPublicCapacityByToken(publicToken);
      if (!view) {
        return withCors(
          errorResponse(404, 'not_found', 'Unknown or disabled share link'),
          request,
          env
        );
      }
      return withCors(okResponse(200, view), request, env);
    }

    const session = getHubSession(request, env);
    if (!session.authenticated) {
      return withCors(errorResponse(401, 'unauthenticated', 'Sign in required'), request, env);
    }

    if (request.method === 'GET') {
      const [snapshot, share] = await Promise.all([
        store.getCapacitySnapshot(),
        store.getCapacityShare()
      ]);
      return withCors(okResponse(200, { snapshot, share }), request, env);
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'ensure_share') {
      const share = await store.ensureCapacityShare();
      return withCors(okResponse(200, { share }), request, env);
    }
    if (body.action === 'rotate_share') {
      const share = await store.rotateCapacityShare();
      return withCors(okResponse(200, { share }), request, env);
    }

    return withCors(errorResponse(400, 'unknown_action', 'Unknown capacity action'), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = { path: '/api/capacity' };
