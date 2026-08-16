import { describe, expect, it } from 'vitest';
import {
  createPassphraseHash,
  createSha256PassphraseHash,
  verifyPassphrase
} from '../../netlify/functions/_shared/auth-security.mts';

describe('passphrase verify', () => {
  it('accepts Knowledge-style SHA-256 hex (Netlify bootstrap)', async () => {
    const hash = createSha256PassphraseHash('tasks-hub-local');
    expect(hash).toBe('7cac18bc155410f079acefd42aec0e87e912ebe3c3f467692446879a9d41ecd9');
    expect(await verifyPassphrase('tasks-hub-local', hash)).toBe(true);
    expect(await verifyPassphrase('wrong', hash)).toBe(false);
  });

  it('accepts Teaching-style scrypt$v1 hashes', async () => {
    const hash = await createPassphraseHash('tasks-hub-local');
    expect(hash.startsWith('scrypt$v1$')).toBe(true);
    expect(await verifyPassphrase('tasks-hub-local', hash)).toBe(true);
    expect(await verifyPassphrase('wrong', hash)).toBe(false);
  });
});
