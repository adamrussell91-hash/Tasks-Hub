type FunctionEnv = NodeJS.ProcessEnv;

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

export function okResponse(
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
  extras?: { warning?: string }
): Response {
  if (extras?.warning) {
    return jsonResponse(status, { ok: true, data, warning: extras.warning }, headers);
  }
  return jsonResponse(status, { ok: true, data }, headers);
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers: Record<string, string> = {}
): Response {
  return jsonResponse(
    status,
    {
      ok: false,
      error: details === undefined ? { code, message } : { code, message, details }
    },
    headers
  );
}

/** Always-allowed browser origins (Pages app + Functions-hosted app). */
export const BUILTIN_SITE_ORIGINS = [
  'https://tasks-hub.adam-russell.com',
  'https://tasks-api.adam-russell.com'
] as const;

export function parseAllowedOrigins(env: FunctionEnv): string[] {
  const extra =
    typeof env.SITE_ORIGIN === 'string'
      ? env.SITE_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
      : [];
  return [...new Set<string>([...BUILTIN_SITE_ORIGINS, ...extra])];
}

export function requireSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (
    (origin === null || origin === new URL(request.url).origin) &&
    (fetchSite === null || fetchSite.toLowerCase() === 'same-origin')
  );
}

export function originIsAllowed(origin: string | null, env: FunctionEnv): boolean {
  return origin !== null && origin.length > 0 && parseAllowedOrigins(env).includes(origin);
}

export function requireAllowedOrigin(request: Request, env: FunctionEnv): boolean {
  if (requireSameOrigin(request)) return true;
  return originIsAllowed(request.headers.get('origin'), env);
}

export function guardRequestOrigin(request: Request, env: FunctionEnv): Response | null {
  return requireAllowedOrigin(request, env)
    ? null
    : errorResponse(403, 'forbidden', 'This request origin is not allowed.');
}

export function corsHeadersForOrigin(origin: string | null, env: FunctionEnv): Record<string, string> {
  if (!originIsAllowed(origin, env)) return {};
  return {
    'access-control-allow-origin': origin as string,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, x-tasks-hub-secret',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    vary: 'origin'
  };
}

export function corsHeaders(request: Request, env: FunctionEnv): Record<string, string> {
  return corsHeadersForOrigin(request.headers.get('origin'), env);
}

export function withCors(response: Response, request: Request, env: FunctionEnv): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export function preflightResponse(request: Request, env: FunctionEnv): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function readCookie(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  const cookies = request.headers.get('cookie');
  if (!cookies) return null;

  for (const part of cookies.split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return null;
}

export function methodNotAllowed(allow: string): Response {
  return errorResponse(405, 'method_not_allowed', 'This method is not allowed.', undefined, { allow });
}

export function isConfigured(env: FunctionEnv): boolean {
  return (
    typeof env.TASKS_HUB_PASSPHRASE_HASH === 'string' &&
    env.TASKS_HUB_PASSPHRASE_HASH.length > 0 &&
    typeof env.SESSION_SECRET === 'string' &&
    Buffer.byteLength(env.SESSION_SECRET, 'utf8') >= 32
  );
}

export function misconfiguredResponse(): Response {
  return errorResponse(503, 'misconfigured', 'This service is not configured.');
}
