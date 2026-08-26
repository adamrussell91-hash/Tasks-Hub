import {
  allowSessionOrMachine,
  getHubSession,
  hasSharedSecret,
  isNetlifyScheduleRequest
} from './_shared/session.mts';
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
import { isIntuitiveScanSlot } from '../../src/domain/intuitive-scan.ts';

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') {
    return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
  }

  const scheduled = isNetlifyScheduleRequest(request);
  if (!scheduled) {
    const originGuard = guardRequestOrigin(request, env);
    if (originGuard) return withCors(originGuard, request, env);
  }
  if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

  const body = await readBody(request);
  const forced = body.force === true;
  const allowed = scheduled || allowSessionOrMachine(request, env);
  if (!allowed) {
    return withCors(errorResponse(401, 'unauthenticated', 'Sign in required'), request, env);
  }

  const now = new Date();
  if (!forced && scheduled && !isIntuitiveScanSlot(now)) {
    return withCors(
      okResponse(200, { skipped: true, reason: 'outside_slot', hour: now.toISOString() }),
      request,
      env
    );
  }
  if (forced && !getHubSession(request, env).authenticated && !hasSharedSecret(request, env)) {
    return withCors(errorResponse(401, 'unauthenticated', 'Force requires a session or shared secret'), request, env);
  }

  const store = await getTasksStore();
  try {
    const result = await store.runIntuitiveScan({ now });
    return withCors(okResponse(200, result), request, env);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed';
    return withCors(errorResponse(400, 'bad_request', message), request, env);
  }
}

export const config = {
  schedule: '0 * * * *',
  path: '/api/intuitive-scan'
};
