import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createPassphraseHash,
  createSha256PassphraseHash,
  verifyPassphrase
} from '../../netlify/functions/_shared/auth-security.mts';

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
});
