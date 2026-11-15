import { chmod, link, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ReleaseVerificationError,
  verifyRelease,
  type ReleaseRefusal,
} from '../../src/releases/verify';
import type { TrustedReleaseKey } from '../../src/releases/trust';
import { releaseSigner, scratch, sha256, trusted, writeBundle } from './release-fixture';

const signer = releaseSigner();
const machine = trusted(signer, 'machine');

let root: string;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ root, close } = await scratch());
});

afterEach(async () => {
  await close();
});

async function refusal(
  keys: readonly TrustedReleaseKey[] = [machine],
  role: 'machine' | 'github' = 'machine',
  artifact: 'ui' | 'hub' = 'ui',
): Promise<ReleaseRefusal> {
  const outcome = await verifyRelease(root, { keys, role, artifact }).then(
    () => null,
    (cause: unknown) => cause,
  );
  if (!(outcome instanceof ReleaseVerificationError)) throw new Error('the release was accepted');
  return outcome.reason;
}

describe('verifyRelease', () => {
  it('accepts a bundle signed by a trusted key whose files match the manifest', async () => {
    await writeBundle(root, signer);
    const release = await verifyRelease(root, { keys: [machine], role: 'machine', artifact: 'ui' });
    expect(release.key).toEqual({
      fingerprint: signer.fingerprint,
      role: 'machine',
      label: 'machine key',
    });
    expect(release.manifest.files.map((file) => file.path)).toEqual([
      'bundle/index.js',
      'assets/a.png',
    ]);
    expect(release.bytes).toBe(18);
  });

  it('refuses a manifest changed after signing', async () => {
    const manifest = await writeBundle(root, signer);
    await writeFile(
      join(root, 'release.json'),
      manifest.toString('utf8').replace('1.2.3', '1.2.4'),
    );
    expect(await refusal()).toBe('bad_signature');
  });

  it('refuses a file changed after signing, by hash and by size', async () => {
    await writeBundle(root, signer);
    await writeFile(join(root, 'files', 'bundle', 'index.js'), 'console.log(2);');
    expect(await refusal()).toBe('hash_mismatch');
    await writeFile(join(root, 'files', 'bundle', 'index.js'), 'console.log(22);');
    expect(await refusal()).toBe('size_mismatch');
  });

  it('refuses a file whose executable bit differs from the signed manifest', async () => {
    await writeBundle(root, signer);
    await chmod(join(root, 'files', 'bundle', 'index.js'), 0o700);
    expect(await refusal()).toBe('mode_mismatch');
  });

  it('refuses a key that is not trusted or has been removed', async () => {
    await writeBundle(root, releaseSigner());
    expect(await refusal()).toBe('unknown_key');
    await writeBundle(root, signer);
    expect(await refusal([])).toBe('unknown_key');
  });

  it('refuses a trusted key used for the other role', async () => {
    await writeBundle(root, signer);
    expect(await refusal([machine], 'github')).toBe('wrong_role');
    expect(await refusal([trusted(signer, 'github')], 'machine')).toBe('wrong_role');
  });

  it('refuses a release of a different artifact', async () => {
    await writeBundle(root, signer);
    expect(await refusal([machine], 'machine', 'hub')).toBe('wrong_artifact');
  });

  it.each([['../escape.js'], ['/etc/passwd'], ['bundle/../../escape.js'], ['a\\b']])(
    'refuses the signed path %j',
    async (path) => {
      await writeBundle(root, signer, {
        listed: [{ path, size: 1, sha256: sha256('x'), executable: false }],
      });
      expect(await refusal()).toBe('unsafe_path');
    },
  );

  it('refuses a symbolic link inside the files folder', async () => {
    await writeBundle(root, signer);
    await symlink('/etc/hostname', join(root, 'files', 'bundle', 'index.js.link'));
    expect(await refusal()).toBe('unsafe_path');
  });

  it('refuses a listed file replaced by a symbolic link', async () => {
    await writeBundle(root, signer, { files: { 'a.js': 'x' } });
    await rm(join(root, 'files', 'a.js'));
    await symlink('/etc/hostname', join(root, 'files', 'a.js'));
    expect(await refusal()).toBe('unsafe_path');
  });

  it('refuses a hard linked file', async () => {
    await writeBundle(root, signer);
    await link(join(root, 'files', 'assets', 'a.png'), join(root, 'files', 'assets', 'b.png'));
    expect(await refusal()).toBe('unsafe_path');
  });

  it('refuses an unexpected entry beside the manifest', async () => {
    await writeBundle(root, signer);
    await writeFile(join(root, 'extra'), 'x');
    expect(await refusal()).toBe('layout');
  });

  it('refuses a manifest that is a symbolic link', async () => {
    await writeBundle(root, signer);
    await writeFile(join(root, 'files', 'm.json'), 'x');
    await rm(join(root, 'release.json'));
    await symlink(join(root, 'files', 'm.json'), join(root, 'release.json'));
    expect(await refusal()).toBe('unsafe_path');
  });

  it('refuses files that are missing or not listed', async () => {
    await writeBundle(root, signer);
    await writeFile(join(root, 'files', 'extra.js'), 'x');
    expect(await refusal()).toBe('unlisted_file');
    await rm(join(root, 'files', 'extra.js'));
    await rm(join(root, 'files', 'assets', 'a.png'));
    expect(await refusal()).toBe('missing_file');
  });

  it('refuses a malformed signature file', async () => {
    await writeBundle(root, signer);
    await writeFile(join(root, 'release.sig'), '{"algorithm":"rsa"}');
    expect(await refusal()).toBe('signature');
  });
});
