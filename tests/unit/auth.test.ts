import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../src/api/client';
import { resolveApiBaseUrl } from '../../src/api/config';
import {
  attachPassphraseCapture,
  messageForSignInFailure,
  normalizePassphrase
} from '../../src/auth/gate';
import {
  createPassphraseHash,
  createSha256PassphraseHash,
  serializeSessionCookie,
  verifyPassphrase
} from '../../netlify/functions/_shared/auth-security.mts';
import {
  corsHeadersForOrigin,
  originIsAllowed,
  parseAllowedOrigins
} from '../../netlify/functions/_shared/http.mts';

describe('passphrase verify', () => {
  it('does not commit a literal SHA-256 passphrase hash in the test source', async () => {
    const source = await readFile(new URL(import.meta.url), 'utf8');
    expect(source).not.toMatch(/toBe\(['"][a-f0-9]{64}['"]\)/i);
  });

  it('accepts Knowledge-style SHA-256 hex (Netlify bootstrap)', async () => {
    const hash = createSha256PassphraseHash('tasks-hub-local');
    expect(hash).toMatch(/^[a-f0-9]{64}$/i);
    expect(await verifyPassphrase('tasks-hub-local', hash)).toBe(true);
    expect(await verifyPassphrase('wrong', hash)).toBe(false);
  });

  it('accepts Teaching-style scrypt$v1 hashes', async () => {
    const hash = await createPassphraseHash('tasks-hub-local');
    expect(hash.startsWith('scrypt$v1$')).toBe(true);
    expect(await verifyPassphrase('tasks-hub-local', hash)).toBe(true);
    expect(await verifyPassphrase('wrong', hash)).toBe(false);
  });

  it('sets a same-site Lax session cookie', () => {
    expect(serializeSessionCookie('token')).toContain('SameSite=Lax');
    expect(serializeSessionCookie('token')).not.toContain('SameSite=None');
  });
});

describe('sign-in helpers', () => {
  it('trims pasted passphrase whitespace', () => {
    expect(normalizePassphrase('  tasks-hub-local  ')).toBe('tasks-hub-local');
  });

  it('keeps keystrokes when input.value is empty at submit', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.name = 'passphrase';
    form.append(input);
    const read = attachPassphraseCapture(input, form);
    input.value = 'tasks-hub-local';
    input.dispatchEvent(new Event('input'));
    input.value = '';
    expect(read()).toBe('tasks-hub-local');
  });

  it('keeps invalid_credentials as Invalid passphrase', () => {
    expect(
      messageForSignInFailure(
        new ApiClientError({ code: 'invalid_credentials', message: 'Invalid passphrase' })
      )
    ).toBe('Invalid passphrase');
  });

  it('points forbidden and network failures at the API host', () => {
    expect(
      messageForSignInFailure(new ApiClientError({ code: 'forbidden', message: 'nope' }))
    ).toContain('https://tasks-api.adam-russell.com');
    expect(
      messageForSignInFailure(new ApiClientError({ code: 'network_error', message: 'fail' }))
    ).toContain('https://tasks-api.adam-russell.com');
  });
});

describe('API base URL', () => {
  it('uses same-origin on the Functions host and localhost', () => {
    expect(resolveApiBaseUrl('tasks-api.adam-russell.com')).toBe('');
    expect(resolveApiBaseUrl('localhost')).toBe('');
  });

  it('uses the configured API origin on the Pages host', () => {
    expect(resolveApiBaseUrl('tasks-hub.adam-russell.com')).toBe(
      'https://tasks-api.adam-russell.com'
    );
  });
});

describe('allowed origins', () => {
  it('always allows Pages and the Functions host', () => {
    const allowed = parseAllowedOrigins({});
    expect(allowed).toContain('https://tasks-hub.adam-russell.com');
    expect(allowed).toContain('https://tasks-api.adam-russell.com');
  });

  it('accepts a Pages Origin and echoes it in CORS', () => {
    const origin = 'https://tasks-hub.adam-russell.com';
    expect(originIsAllowed(origin, {})).toBe(true);
    expect(corsHeadersForOrigin(origin, {})['access-control-allow-origin']).toBe(origin);
  });

  it('rejects an unknown Origin', () => {
    expect(originIsAllowed('https://evil.example', {})).toBe(false);
    expect(corsHeadersForOrigin('https://evil.example', {})).toEqual({});
  });
});
