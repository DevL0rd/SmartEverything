import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ReleaseKeyRole } from '@smarteverything/domain';
import { releaseKeyFingerprint, type TrustedReleaseKey } from '../../src/releases/trust';

export interface ReleaseSigner {
  readonly publicKey: string;
  readonly fingerprint: string;
  readonly privateKey: KeyObject;
}

export function releaseSigner(): ReleaseSigner {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.from(String(jwk.x), 'base64url').toString('base64');
  return { publicKey: raw, fingerprint: releaseKeyFingerprint(raw), privateKey };
}

export function trusted(signer: ReleaseSigner, role: ReleaseKeyRole): TrustedReleaseKey {
  return {
    fingerprint: signer.fingerprint,
    publicKey: signer.publicKey,
    role,
    label: `${role} key`,
    trustedAt: '2026-11-14T00:00:00.000Z',
  };
}

export const COMMIT = 'a'.repeat(40);

export async function scratch(): Promise<{ root: string; close: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'release-test-'));
  return { root, close: () => rm(root, { recursive: true, force: true }) };
}

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface BundleOptions {
  readonly files?: Readonly<Record<string, string>>;
  readonly listed?: readonly {
    path: string;
    size: number;
    sha256: string;
    executable: boolean;
  }[];
}

export async function writeBundle(
  root: string,
  signer: ReleaseSigner,
  options: BundleOptions = {},
): Promise<Buffer> {
  const files = options.files ?? { 'bundle/index.js': 'console.log(1);', 'assets/a.png': 'png' };
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, 'files', ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await mkdir(join(root, 'files'), { recursive: true });
  const listed =
    options.listed ??
    Object.entries(files).map(([path, content]) => ({
      path,
      size: Buffer.byteLength(content),
      sha256: sha256(content),
      executable: false,
    }));
  const manifest = Buffer.from(
    JSON.stringify({
      artifact: 'ui',
      target: 'android',
      facts: { runtimeVersion: '1.0.0' },
      version: '1.2.3',
      commit: COMMIT,
      notes: 'Fixes a thing.',
      files: listed,
      gate: { typeCheck: 'passed', commit: COMMIT },
    }),
  );
  await writeFile(join(root, 'release.json'), manifest);
  await writeFile(
    join(root, 'release.sig'),
    JSON.stringify({
      algorithm: 'ed25519',
      fingerprint: signer.fingerprint,
      signature: sign(null, manifest, signer.privateKey).toString('base64'),
    }),
  );
  return manifest;
}
