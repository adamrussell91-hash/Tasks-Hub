/**
 * Production API origin. Prefer VITE_API_BASE_URL at Pages build time.
 */
const PLACEHOLDER_API_BASE_URL = 'https://tasks-api.adam-russell.com';

function readViteApiBaseUrl(): string | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  const value = (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env
    ?.VITE_API_BASE_URL;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\/$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

const PRODUCTION_API_BASE_URL = readViteApiBaseUrl() ?? PLACEHOLDER_API_BASE_URL;

const LOCAL_HOSTNAME_RE = /^(localhost|127\.0\.0\.1|\[::1\])$/;

function resolveDefaultBaseUrl(): string {
  if (typeof location === 'undefined') return '';
  return LOCAL_HOSTNAME_RE.test(location.hostname) ? '' : PRODUCTION_API_BASE_URL;
}

export const API_BASE_URL = resolveDefaultBaseUrl();

export function getApiBaseUrl(override?: string): string {
  if (override !== undefined) return override;
  return API_BASE_URL;
}
