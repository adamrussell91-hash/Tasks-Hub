import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions
} from 'node:crypto';

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const HASH_LENGTH = 32;
const SESSION_MS = 12 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = 'tasks_hub_session';

// Lax, not None: Pages (`tasks-hub`) and Functions (`tasks-api`) are same-site
// under adam-russell.com. Safari ITP treats SameSite=None as a tracking cookie
// and often drops it on the cross-origin sign-in POST.
const SESSION_COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Lax';

function scryptAsync(password: string | Buffer, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export interface CreatePassphraseHashOptions {
  salt?: Buffer;
}

export async function createPassphraseHash(
  passphrase: string | Buffer,
  { salt = nodeRandomBytes(16) }: CreatePassphraseHashOptions = {}
): Promise<string> {
  const saltBuffer = Buffer.from(salt);
  const hash = await derivePassphraseHash(passphrase, saltBuffer);
  return `scrypt$v1$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${saltBuffer.toString('base64url')}$${hash.toString('base64url')}`;
}

/**
 * Accepts Teaching-style `scrypt$v1$…` or Knowledge-style bare SHA-256 hex
 * (what the Netlify bootstrap set for `tasks-hub-local`).
 */
export async function verifyPassphrase(passphrase: string | Buffer, encoded: unknown): Promise<boolean> {
  if (typeof encoded !== 'string' || encoded.length === 0) return false;

  if (/^[a-f0-9]{64}$/i.test(encoded)) {
    const actual = createHash('sha256').update(passphrase).digest('hex');
    try {
      const a = Buffer.from(actual, 'utf8');
      const b = Buffer.from(encoded.toLowerCase(), 'utf8');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  const parsed = parsePassphraseHash(encoded);
  if (!parsed) return false;

  try {
    const actual = await derivePassphraseHash(passphrase, parsed.salt);
    return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
  } catch {
    return false;
  }
}

/** Knowledge Hub convention — useful for Netlify env bootstraps. */
export function createSha256PassphraseHash(passphrase: string | Buffer): string {
  return createHash('sha256').update(passphrase).digest('hex');
}

export interface SessionTokenPayload {
  v: 1;
  iat: number;
  exp: number;
  jti: string;
}

export interface SessionToken {
  token: string;
  expiresAt: string;
}

export interface CreateSessionTokenOptions {
  now?: number;
  randomBytes?: (size: number) => Buffer;
}

export function createSessionToken(
  { now = Date.now(), randomBytes: bytes = nodeRandomBytes }: CreateSessionTokenOptions = {},
  secret: string | undefined
): SessionToken {
  assertSessionSecret(secret);
  const payload: SessionTokenPayload = {
    v: 1,
    iat: now,
    exp: now + SESSION_MS,
    jti: bytes(16).toString('base64url')
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return { token: `${encoded}.${signature}`, expiresAt: new Date(payload.exp).toISOString() };
}

export type SessionVerification =
  | { valid: true; payload: SessionTokenPayload }
  | { valid: false; reason: 'malformed' | 'invalid-signature' | 'expired' };

export function verifySessionToken(token: unknown, secret: string | undefined, now: number = Date.now()): SessionVerification {
  assertSessionSecret(secret);
  if (typeof token !== 'string') return { valid: false, reason: 'malformed' };

  const [encoded, signature, ...extra] = token.split('.');
  const encodedPayload = decodeCanonicalBase64Url(encoded);
  const supplied = decodeCanonicalBase64Url(signature);
  if (extra.length || !encodedPayload || !supplied) {
    return { valid: false, reason: 'malformed' };
  }

  const expected = createHmac('sha256', secret).update(encoded).digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return { valid: false, reason: 'invalid-signature' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(encodedPayload.toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!isValidSessionPayload(payload)) return { valid: false, reason: 'malformed' };
  if (now >= payload.exp) return { valid: false, reason: 'expired' };
  return { valid: true, payload };
}

export function serializeSessionCookie(token: string): string {
  const maxAgeSeconds = Math.floor(SESSION_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${token}; Max-Age=${maxAgeSeconds}; ${SESSION_COOKIE_ATTRIBUTES}`;
}

export function serializeExpiredSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${SESSION_COOKIE_ATTRIBUTES}`;
}

async function derivePassphraseHash(passphrase: string | Buffer, salt: Buffer): Promise<Buffer> {
  return scryptAsync(passphrase, salt, HASH_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024
  });
}

function parsePassphraseHash(encoded: unknown): { salt: Buffer; hash: Buffer } | null {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (
    parts.length !== 7 ||
    parts[0] !== 'scrypt' ||
    parts[1] !== 'v1' ||
    parts[2] !== String(SCRYPT_COST) ||
    parts[3] !== String(SCRYPT_BLOCK_SIZE) ||
    parts[4] !== String(SCRYPT_PARALLELIZATION)
  ) {
    return null;
  }
  const salt = decodeCanonicalBase64Url(parts[5]);
  const hash = decodeCanonicalBase64Url(parts[6]);
  return salt && hash && salt.length > 0 && hash.length === HASH_LENGTH ? { salt, hash } : null;
}

function decodeCanonicalBase64Url(value: unknown): Buffer | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.toString('base64url') === value ? decoded : null;
  } catch {
    return null;
  }
}

function isValidSessionPayload(payload: unknown): payload is SessionTokenPayload {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  return (
    candidate.v === 1 &&
    Number.isFinite(candidate.iat) &&
    Number.isFinite(candidate.exp) &&
    candidate.exp === (candidate.iat as number) + SESSION_MS &&
    Boolean(decodeCanonicalBase64Url(candidate.jti))
  );
}

function assertSessionSecret(secret: unknown): asserts secret is string {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Session secret must be at least 32 UTF-8 bytes.');
  }
}
