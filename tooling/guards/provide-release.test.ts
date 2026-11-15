import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Headers, Response } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RELEASE_MANIFEST, RELEASE_SIGNATURE } from '@smarteverything/domain';
import { releaseKeyFingerprint } from '../../apps/hub/src/releases/trust.ts';
import { ReleaseVerificationError } from '../../apps/hub/src/releases/verify.ts';
import {
  ReleaseBundleError,
  packedBundle,
  releaseManifestOf,
  signBundle,
  tarName,
  unsignedBundleOf,
  writeManifest,
  writeTar,
} from '../provide-release-bundle.ts';
import { pushedCleanCommit, ReleaseTreeError, type Git } from '../provide-release-git.ts';
import {
  ReleaseKeyFileError,
  identityOf,
  initReleaseKey,
  readKeyFile,
  signatureOf,
} from '../provide-release-keys.ts';
import { ProvideUsageError, parseArguments } from '../provide-release.ts';
import {
  missingRanges,
  uploadRelease,
  type HubConnection,
  type Transport,
} from '../provide-release-upload.ts';

const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(40);
const UI_FACTS = { runtimeVersion: 'runtime-1' };

let folder = '';

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'provide-release-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

function draft(
  commit: string = COMMIT,
  gate: string = COMMIT,
): Parameters<typeof releaseManifestOf>[0] {
  return {
    artifact: 'ui',
    target: 'android',
    version: '1.2.3',
    facts: UI_FACTS,
    commit,
    notes: 'A new release.',
    gate: { typeCheck: 'passed', commit: gate },
  };
}

function bundleWith(files: Readonly<Record<string, string>>): { bundle: string; files: string } {
  const bundle = join(folder, 'bundle');
  const directory = join(bundle, 'files');
  mkdirSync(directory, { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), text);
  }
  return { bundle, files: directory };
}

describe('machine release key', () => {
  it('makes a private key once, keeps it readable only by the owner and never overwrites it', () => {
    const directory = join(folder, 'keys');
    const first = initReleaseKey(directory);
    const second = initReleaseKey(directory);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.identity).toEqual(first.identity);
    expect(statSync(join(directory, 'machine.key')).mode & 0o777).toBe(0o600);
    expect(first.identity.fingerprint).toBe(releaseKeyFingerprint(first.identity.publicKey));
  });

  it('refuses a key file that others can read', () => {
    const directory = join(folder, 'keys');
    initReleaseKey(directory);
    const file = join(directory, 'machine.key');
    rmSync(file);
    writeFileSync(file, 'x', { mode: 0o644 });
    expect(() => readKeyFile(file)).toThrow(ReleaseKeyFileError);
  });

  it('signs exact bytes so the public key verifies them and nothing else', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const bytes = Buffer.from('{"a":1}\n');
    const signature = RELEASE_SIGNATURE.parse(signatureOf(bytes, privateKey));
    expect(signature.fingerprint).toBe(identityOf(privateKey).fingerprint);
    expect(verify(null, bytes, publicKey, Buffer.from(signature.signature, 'base64'))).toBe(true);
    expect(
      verify(null, Buffer.from('{"a":2}\n'), publicKey, Buffer.from(signature.signature, 'base64')),
    ).toBe(false);
  });
});

describe('release manifest', () => {
  it('lists every file with its size and hash', async () => {
    const { files } = bundleWith({ 'metadata.json': '{}', 'bundles/app.hbc': 'bytes' });
    const manifest = await releaseManifestOf(draft(), files);
    expect(manifest.files).toEqual([
      {
        path: 'bundles/app.hbc',
        size: 5,
        sha256: createHash('sha256').update('bytes').digest('hex'),
        executable: false,
      },
      {
        path: 'metadata.json',
        size: 2,
        sha256: createHash('sha256').update('{}').digest('hex'),
        executable: false,
      },
    ]);
    expect(RELEASE_MANIFEST.safeParse(manifest).success).toBe(true);
  });

  it('refuses a type check that passed for a different commit', async () => {
    const { files } = bundleWith({ 'a.txt': 'a' });
    await expect(releaseManifestOf(draft(COMMIT, OTHER_COMMIT), files)).rejects.toThrow(
      ReleaseBundleError,
    );
  });

  it('refuses an empty release and unknown facts', async () => {
    const { files } = bundleWith({});
    await expect(releaseManifestOf(draft(), files)).rejects.toThrow(ReleaseBundleError);
    const filled = bundleWith({ 'a.txt': 'a' });
    await expect(
      releaseManifestOf({ ...draft(), facts: { ...UI_FACTS, extra: 1 } }, filled.files),
    ).rejects.toThrow(ReleaseBundleError);
  });

  it('refuses a symbolic link and a hard link', async () => {
    const { files } = bundleWith({ 'a.txt': 'a' });
    symlinkSync(join(files, 'a.txt'), join(files, 'link.txt'));
    await expect(releaseManifestOf(draft(), files)).rejects.toThrow('link.txt');
    rmSync(join(files, 'link.txt'));
    linkSync(join(files, 'a.txt'), join(files, 'hard.txt'));
    await expect(releaseManifestOf(draft(), files)).rejects.toThrow('a.txt');
  });
});

describe('signed bundle', () => {
  async function signed(): Promise<{
    tar: string;
    key: ReturnType<typeof generateKeyPairSync>['privateKey'];
  }> {
    const { privateKey } = generateKeyPairSync('ed25519');
    const { bundle, files } = bundleWith({ 'metadata.json': '{}', 'deep/er/file.bin': 'payload' });
    await writeManifest(bundle, await releaseManifestOf(draft(), files));
    await signBundle(bundle, privateKey);
    const tar = join(folder, 'out.tar');
    const verified = await packedBundle(bundle, tar, folder, privateKey);
    expect(verified.manifest.artifact).toBe('ui');
    expect(verified.key.fingerprint).toBe(identityOf(privateKey).fingerprint);
    return { tar, key: privateKey };
  }

  it('packs a tar the hub reader unpacks and verifies with the machine key', async () => {
    const { tar } = await signed();
    expect(statSync(tar).size).toBeGreaterThan(0);
  });

  it('carries the executable bit through the manifest and the tar', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const { bundle, files } = bundleWith({ 'run.sh': '#!/bin/sh\n', 'plain.txt': 'a' });
    chmodSync(join(files, 'run.sh'), 0o755);
    const manifest = await releaseManifestOf(draft(), files);
    expect(manifest.files.map((file) => [file.path, file.executable])).toEqual([
      ['plain.txt', false],
      ['run.sh', true],
    ]);
    await writeManifest(bundle, manifest);
    await signBundle(bundle, privateKey);
    const tar = join(folder, 'mode.tar');
    await packedBundle(bundle, tar, folder, privateKey);
    const into = join(folder, 'mode-out');
    await unsignedBundleOf(tar, into);
    expect(statSync(join(into, 'files', 'run.sh')).mode & 0o777).toBe(0o700);
    expect(statSync(join(into, 'files', 'plain.txt')).mode & 0o777).toBe(0o600);
  });

  it('is refused when another key signed it', async () => {
    const { bundle, files } = bundleWith({ 'a.txt': 'a' });
    await writeManifest(bundle, await releaseManifestOf(draft(), files));
    const { privateKey: signer } = generateKeyPairSync('ed25519');
    const { privateKey: trusted } = generateKeyPairSync('ed25519');
    await signBundle(bundle, signer);
    await expect(packedBundle(bundle, join(folder, 'x.tar'), folder, trusted)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ReleaseVerificationError && error.reason === 'unknown_key',
    );
  });

  it('is refused when a file changes after the manifest was written', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const { bundle, files } = bundleWith({ 'a.txt': 'a' });
    await writeManifest(bundle, await releaseManifestOf(draft(), files));
    await signBundle(bundle, privateKey);
    writeFileSync(join(files, 'a.txt'), 'b');
    await expect(packedBundle(bundle, join(folder, 'x.tar'), folder, privateKey)).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ReleaseVerificationError && error.reason === 'hash_mismatch',
    );
  });

  it('signs an unsigned bundle made for a github release', async () => {
    const { bundle, files } = bundleWith({ 'a.txt': 'a' });
    const manifest = await releaseManifestOf(draft(), files);
    await writeManifest(bundle, manifest);
    const unsigned = join(folder, 'unsigned.tar');
    await writeTar(bundle, unsigned);
    const again = join(folder, 'again');
    const read = await unsignedBundleOf(unsigned, again);
    expect(read).toEqual(manifest);
    const { privateKey } = generateKeyPairSync('ed25519');
    await signBundle(again, privateKey);
    const verified = await packedBundle(again, join(folder, tarName(read)), folder, privateKey);
    expect(verified.manifest.version).toBe('1.2.3');
  });
});

describe('pushed clean commit', () => {
  function git(replies: Readonly<Record<string, { status: number; text: string }>>): Git {
    return (args) => replies[args.join(' ')] ?? { status: 1, text: '' };
  }

  const clean = {
    'status --porcelain': { status: 0, text: '' },
    'fetch --quiet origin main': { status: 0, text: '' },
    'rev-parse HEAD': { status: 0, text: COMMIT },
  };

  it('returns the commit when the tree is clean and HEAD is on origin/main', () => {
    expect(
      pushedCleanCommit(
        git({
          ...clean,
          [`merge-base --is-ancestor ${COMMIT} origin/main`]: { status: 0, text: '' },
        }),
      ),
    ).toBe(COMMIT);
  });

  it('refuses a dirty tree', () => {
    expect(() =>
      pushedCleanCommit(git({ ...clean, 'status --porcelain': { status: 0, text: ' M a.ts' } })),
    ).toThrow(/not clean/u);
  });

  it('refuses a HEAD that is not pushed', () => {
    expect(() =>
      pushedCleanCommit(
        git({
          ...clean,
          [`merge-base --is-ancestor ${COMMIT} origin/main`]: { status: 1, text: '' },
        }),
      ),
    ).toThrow(ReleaseTreeError);
  });
});

describe('arguments', () => {
  it('reads a ui build written to a folder', () => {
    const parsed = parseArguments(['ui', '--notes', 'Faster.', '--out', folder, '--unsigned']);
    expect(parsed).toMatchObject({ mode: 'build', build: { command: 'ui', unsigned: true } });
  });

  it('refuses missing or conflicting options', () => {
    expect(() => parseArguments(['ui'])).toThrow(ProvideUsageError);
    expect(() =>
      parseArguments(['ui', '--notes', 'x', '--out', folder, '--hub', 'https://hub.example']),
    ).toThrow(ProvideUsageError);
    expect(() => parseArguments(['ui', '--notes', 'x', '--unsigned'])).toThrow(ProvideUsageError);
    expect(() => parseArguments(['coffee', '--notes', 'x'])).toThrow(ProvideUsageError);
    expect(() => parseArguments(['desktop', '--notes', 'x', '--arches', 'mips'])).toThrow(
      ProvideUsageError,
    );
    expect(() => parseArguments(['sign', 'a.tar'])).toThrow(ProvideUsageError);
  });
});

describe('upload', () => {
  it('finds the gaps in what the hub already holds', () => {
    expect(
      missingRanges(10, [
        { start: 2, end: 4 },
        { start: 6, end: 8 },
      ]),
    ).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
      { start: 8, end: 10 },
    ]);
    expect(missingRanges(4, [{ start: 0, end: 4 }])).toEqual([]);
  });

  it('begins, sends only the missing bytes and finishes', async () => {
    const tar = join(folder, 'b.tar');
    writeFileSync(tar, 'abcdefghij');
    const calls: string[] = [];
    const sent: string[] = [];
    const uploadId = '3f8e7a52-2c8b-4f6a-9e0f-1b3c5d7e9a11';
    const record = (
      state: 'receiving' | 'staged',
      received: { start: number; end: number }[],
    ): string =>
      JSON.stringify({
        uploadId,
        artifact: 'ui',
        size: 10,
        sha256: createHash('sha256').update('abcdefghij').digest('hex'),
        state,
        createdAt: new Date(0).toISOString(),
        received,
        receivedBytes: received.reduce((total, range) => total + range.end - range.start, 0),
        release: null,
      });
    const transport: Transport = (input, init?) => {
      const url = new URL(input instanceof URL ? input.href : '');
      calls.push(`${String(init?.method)} ${url.pathname}`);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token-value');
      if (url.pathname.includes('/chunks/')) {
        sent.push(
          `${url.pathname.split('/').pop() ?? ''}:${Buffer.isBuffer(init?.body) ? init.body.toString('utf8') : ''}`,
        );
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      const body = url.pathname.endsWith('/finish')
        ? record('staged', [{ start: 0, end: 10 }])
        : record('receiving', [{ start: 0, end: 4 }]);
      return Promise.resolve(new Response(body, { status: 200 }));
    };
    const connection: HubConnection = {
      url: new URL('https://hub.example'),
      token: 'token-value',
      pin: undefined,
    };
    const upload = await uploadRelease({ connection, transport, artifact: 'ui', tar });
    expect(upload.state).toBe('staged');
    expect(calls).toEqual([
      'POST /api/releases/uploads',
      `PUT /api/releases/uploads/${uploadId}/chunks/4`,
      `POST /api/releases/uploads/${uploadId}/finish`,
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.startsWith('4:')).toBe(true);
  });
});
