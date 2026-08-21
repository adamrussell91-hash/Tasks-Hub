import { createSessionToken, serializeSessionCookie, verifyPassphrase } from './_shared/auth-security.mts';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export default async function handler(request: Request): Promise<Response> {
  const env = process.env;

  try {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);

    const originGuard = guardRequestOrigin(request, env);
    if (originGuard) return withCors(originGuard, request, env);
    if (!isConfigured(env)) return withCors(misconfiguredResponse(), request, env);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return withCors(errorResponse(400, 'invalid_json', 'Request body is not valid JSON'), request, env);
    }

    const raw = isRecord(body) ? body.passphrase : undefined;
    const passphrase = typeof raw === 'string' ? raw.normalize('NFC').trim() : undefined;
    if (typeof passphrase !== 'string' || !(await verifyPassphrase(passphrase, env.TASKS_HUB_PASSPHRASE_HASH))) {
      return withCors(errorResponse(401, 'invalid_credentials', 'Invalid passphrase'), request, env);
    }

    const issued = createSessionToken({}, env.SESSION_SECRET);
    return withCors(
      okResponse(
        200,
        { authenticated: true, expiresAt: Date.parse(issued.expiresAt) },
        { 'set-cookie': serializeSessionCookie(issued.token) }
      ),
      request,
      env
    );
  } catch {
    return withCors(errorResponse(500, 'internal', 'Sign-in failed. Try again.'), request, env);
  }
}

export const config = { path: '/api/auth' };
