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

  const store = getTasksStore();
  const url = new URL(request.url);

  try {
    if (request.method === 'GET') {
      const inbox = url.searchParams.get('inbox');
      if (inbox) {
        const flags = await store.listAgentInbox(inbox);
        return withCors(okResponse(200, { flags, inbox }), request, env);
      }
      const flags = await store.listStressFlags();
      return withCors(okResponse(200, { flags }), request, env);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;

    if (action === 'scan') {
      const result = await store.scanAndRaiseStressFlags();
      return withCors(okResponse(200, result), request, env);
    }

    if (action === 'raise') {
      const flag = await store.raiseStressFlag({
        pattern_description: String(body.pattern_description ?? ''),
        pattern_kind: (body.pattern_kind as 'manual') ?? 'manual',
        source_project_or_task_id:
          body.source_project_or_task_id === undefined || body.source_project_or_task_id === null
            ? null
            : String(body.source_project_or_task_id),
        fingerprint: body.fingerprint === undefined ? undefined : String(body.fingerprint)
      });
      return withCors(okResponse(201, flag), request, env);
    }

    return withCors(errorResponse(400, 'unknown_action', 'Unknown stress-flags action'), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = { path: '/api/stress-flags' };
