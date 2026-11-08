import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { gitSource, gitSourceText, probeHubUpdateTip } from '../hub-update-source.ts';

function git(folder: string, ...args: string[]): Promise<string> {
  return gitSourceText(folder, args, 'prepare the Git test fixture');
}

it('reads the configured branch tip without fetching objects or changing pending work', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'hub-update-tip-'));
  try {
    const upstream = join(scratch, 'upstream');
    const folder = join(scratch, 'source');
    await git(scratch, 'init', '-b', 'main', upstream);
    await git(scratch, 'init', '-b', 'main', folder);
    await git(folder, 'remote', 'add', 'origin', upstream);
    const pending = 'Pending work\n';
    writeFileSync(join(folder, 'pending.txt'), pending);
    writeFileSync(join(upstream, 'release.txt'), 'New release\n');
    await git(upstream, 'add', 'release.txt');
    await git(
      upstream,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'publish configured branch',
    );
    const tip = (await git(upstream, 'rev-parse', 'HEAD')).trim();
    const state = await git(folder, 'status', '--porcelain=v1');
    await expect(probeHubUpdateTip({ folder, remote: 'origin', branch: 'main' })).resolves.toBe(
      tip,
    );
    await expect(git(folder, 'status', '--porcelain=v1')).resolves.toBe(state);
    await expect(git(folder, 'for-each-ref')).resolves.toBe('');
    await expect(gitSource(folder, ['cat-file', '-e', tip])).resolves.not.toHaveProperty('code', 0);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
