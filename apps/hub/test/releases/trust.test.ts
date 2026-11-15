import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  releaseKeyFingerprint,
  removeReleaseKey,
  trustedReleaseKeys,
  trustReleaseKey,
} from '../../src/releases/trust';
import { verifyRelease } from '../../src/releases/verify';
import { releaseSigner, scratch, writeBundle } from './release-fixture';

const NOW = new Date('2026-11-14T08:00:00.000Z');

let root: string;
let close: () => Promise<void>;
let path: string;

beforeEach(async () => {
  ({ root, close } = await scratch());
  path = join(root, 'system', 'keys', 'release-keys.json');
});

afterEach(async () => {
  await close();
});

describe('trusted release keys', () => {
  it('stores public keys with role, label and fingerprint in a private file', async () => {
    const signer = releaseSigner();
    expect(await trustedReleaseKeys(path)).toEqual([]);
    const key = await trustReleaseKey(
      path,
      { publicKey: signer.publicKey, role: 'machine', label: 'Desk PC' },
      NOW,
    );
    expect(key).toEqual({
      fingerprint: signer.fingerprint,
      publicKey: signer.publicKey,
      role: 'machine',
      label: 'Desk PC',
      trustedAt: NOW.toISOString(),
    });
    expect(await trustedReleaseKeys(path)).toEqual([key]);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, 'system', 'keys'))).mode & 0o777).toBe(0o700);
    expect(await readFile(path, 'utf8')).not.toContain('PRIVATE');
  });

  it('keeps a repeated trust idempotent and refuses a changed role or label', async () => {
    const signer = releaseSigner();
    const request = { publicKey: signer.publicKey, role: 'machine', label: 'Desk PC' } as const;
    const first = await trustReleaseKey(path, request, NOW);
    expect(await trustReleaseKey(path, request, new Date())).toEqual(first);
    await expect(trustReleaseKey(path, { ...request, role: 'github' }, NOW)).rejects.toThrow(
      'already trusted',
    );
    await expect(trustReleaseKey(path, { ...request, label: 'Other' }, NOW)).rejects.toThrow(
      'already trusted',
    );
  });

  it('refuses a key that is not a 32 byte Ed25519 key', async () => {
    const short = Buffer.alloc(31, 1).toString('base64').padEnd(44, '=');
    await expect(
      trustReleaseKey(path, { publicKey: short, role: 'machine', label: 'Bad' }, NOW),
    ).rejects.toThrow();
    expect(await trustedReleaseKeys(path)).toEqual([]);
  });

  it('serializes concurrent trusts so none is lost', async () => {
    const signers = Array.from({ length: 5 }, () => releaseSigner());
    await Promise.all(
      signers.map((signer, index) =>
        trustReleaseKey(
          path,
          { publicKey: signer.publicKey, role: 'machine', label: `PC ${String(index)}` },
          NOW,
        ),
      ),
    );
    expect((await trustedReleaseKeys(path)).map((key) => key.fingerprint).sort()).toEqual(
      signers.map((signer) => signer.fingerprint).sort(),
    );
  });

  it('refuses a release signed by a key after it is removed', async () => {
    const signer = releaseSigner();
    await trustReleaseKey(
      path,
      { publicKey: signer.publicKey, role: 'machine', label: 'Desk PC' },
      NOW,
    );
    const bundle = join(root, 'bundle');
    await writeBundle(bundle, signer);
    const expectation = async (): Promise<Parameters<typeof verifyRelease>[1]> => ({
      keys: await trustedReleaseKeys(path),
      role: 'machine',
      artifact: 'ui',
    });
    await expect(verifyRelease(bundle, await expectation())).resolves.toMatchObject({
      key: { fingerprint: signer.fingerprint },
    });
    await removeReleaseKey(path, signer.fingerprint);
    await expect(verifyRelease(bundle, await expectation())).rejects.toMatchObject({
      reason: 'unknown_key',
    });
    await expect(removeReleaseKey(path, signer.fingerprint)).rejects.toThrow(
      'No trusted release key',
    );
  });

  it('refuses a stored key whose fingerprint does not match', async () => {
    const signer = releaseSigner();
    await trustReleaseKey(
      path,
      { publicKey: signer.publicKey, role: 'machine', label: 'Desk PC' },
      NOW,
    );
    const text = await readFile(path, 'utf8');
    await writeFile(
      path,
      text.replace(signer.fingerprint, releaseKeyFingerprint(releaseSigner().publicKey)),
    );
    await expect(trustedReleaseKeys(path)).rejects.toThrow('does not match');
  });
});
