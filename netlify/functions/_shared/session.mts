import { SESSION_COOKIE_NAME, verifySessionToken } from './auth-security.mts';
import { readCookie } from './http.mts';

export interface HubSessionState {
  authenticated: boolean;
  expiresAt?: number;
}

export function getHubSession(request: Request, env: NodeJS.ProcessEnv): HubSessionState {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  const verification = verifySessionToken(token, env.SESSION_SECRET);
  return verification.valid ? { authenticated: true, expiresAt: verification.payload.exp } : { authenticated: false };
}

export function hasSharedSecret(request: Request, env: NodeJS.ProcessEnv): boolean {
  const secret = env.TASKS_HUB_SHARED_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  const header = request.headers.get('x-tasks-hub-secret') ?? '';
  return auth === `Bearer ${secret}` || header === secret;
}

export function isNetlifyScheduleRequest(request: Request): boolean {
  return (request.headers.get('x-nf-event') ?? '').toLowerCase() === 'schedule';
}

export function allowSessionOrMachine(
  request: Request,
  env: NodeJS.ProcessEnv
): boolean {
  return getHubSession(request, env).authenticated || hasSharedSecret(request, env);
}
