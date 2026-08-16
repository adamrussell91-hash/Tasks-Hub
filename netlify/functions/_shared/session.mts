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
