import { getHubSession } from './_shared/session.mts';
import {
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
  const data = session.authenticated
    ? { authenticated: true, expiresAt: session.expiresAt }
    : { authenticated: false };

  return withCors(okResponse(200, data), request, env);
}

export const config = { path: '/api/session' };
