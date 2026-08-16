import { serializeExpiredSessionCookie } from './_shared/auth-security.mts';
import { guardRequestOrigin, methodNotAllowed, okResponse, preflightResponse, withCors } from './_shared/http.mts';

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  if (request.method === 'OPTIONS') return preflightResponse(request, env);
  if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);

  const originGuard = guardRequestOrigin(request, env);
  if (originGuard) return withCors(originGuard, request, env);

  return withCors(
    okResponse(200, { loggedOut: true }, { 'set-cookie': serializeExpiredSessionCookie() }),
    request,
    env
  );
}

export const config = { path: '/api/logout' };
