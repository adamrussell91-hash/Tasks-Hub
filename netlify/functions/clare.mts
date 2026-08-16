import { getHubSession } from './_shared/session.mts';
import { getTasksStore } from './_shared/blobs.mts';
import type { ClareProposal } from '../../src/domain/clare.ts';
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
      const domain = url.searchParams.get('domain');
      if (domain) {
        const calibration = await store.getClareCalibration(domain as 'teaching');
        return withCors(okResponse(200, { calibration }), request, env);
      }
      const calibrations = await store.listClareCalibrations();
      return withCors(okResponse(200, { calibrations }), request, env);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;

    if (action === 'propose') {
      const proposal = await store.proposeWithClare({
        title: String(body.title ?? ''),
        domain: body.domain as 'teaching',
        description: body.description === undefined ? undefined : String(body.description),
        priority: body.priority as 'medium' | undefined,
        due_date:
          body.due_date === undefined || body.due_date === null ? null : String(body.due_date)
      });
      return withCors(okResponse(200, proposal), request, env);
    }

    if (action === 'accept') {
      const result = await store.acceptClareProposal({
        proposal: body.proposal as ClareProposal,
        accepted_minutes: Number(body.accepted_minutes),
        framework_id: body.framework_id === undefined ? undefined : String(body.framework_id)
      });
      return withCors(okResponse(201, result), request, env);
    }

    if (action === 'record_actual') {
      const result = await store.recordClareActual(
        String(body.task_id),
        Number(body.actual_minutes)
      );
      return withCors(okResponse(200, result), request, env);
    }

    return withCors(errorResponse(400, 'unknown_action', 'Unknown clare action'), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = { path: '/api/clare' };
