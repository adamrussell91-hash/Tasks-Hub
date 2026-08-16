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
import type { StallOutcome } from '../../src/domain/stall.ts';

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

  try {
    if (request.method === 'GET') {
      const reviews = await store.listReviewLogs();
      return withCors(okResponse(200, { reviews }), request, env);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;

    if (action === 'flag_stalled') {
      const result = await store.flagStalledProjects({
        weeks: body.weeks === undefined ? undefined : Number(body.weeks)
      });
      return withCors(okResponse(200, result), request, env);
    }

    if (action === 'resolve') {
      const result = await store.resolveStalledProject({
        project_id: String(body.project_id),
        outcome: body.outcome as StallOutcome,
        reason: String(body.reason ?? ''),
        merge_into_project_id:
          body.merge_into_project_id === undefined || body.merge_into_project_id === null
            ? null
            : String(body.merge_into_project_id)
      });
      return withCors(okResponse(200, result), request, env);
    }

    return withCors(errorResponse(400, 'unknown_action', 'Unknown stall action'), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = { path: '/api/stall' };
