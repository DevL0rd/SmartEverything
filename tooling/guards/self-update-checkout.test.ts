import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataLayoutOf } from '../release-hub-files.ts';
import { syncedCheckout, SyncedCheckoutError } from '../self-update-checkout.ts';
import { writeUpdateSource } from './update-source-fixture.ts';

let scratch: string;
let remote: string;
let checkout: string;
let other: string;
let data: string;

function git(folder: string, ...args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: folder,
    encoding: 'utf8',
    env: {
      PATH: env['PATH'] ?? '',
      HOME: scratch,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.test',
    },
  }).trim();
}

function commit(folder: string, name: string): string {
  writeFileSync(join(folder, name), name);
  git(folder, 'add', name);
  git(folder, 'commit', '-m', name);
  return git(folder, 'rev-parse', 'HEAD');
}

const layout = (): ReturnType<typeof dataLayoutOf> => dataLayoutOf(data);
const install = vi.fn<(root: string) => void>();

beforeEach(() => {
  install.mockReset();
  scratch = mkdtempSync(join(tmpdir(), 'self-update-checkout-'));
  remote = join(scratch, 'remote.git');
  checkout = join(scratch, 'checkout');
  other = join(scratch, 'other');
  data = join(scratch, 'data');
  mkdirSync(remote);
  git(remote, 'init', '--bare', '--initial-branch=main');
  git(scratch, 'clone', remote, checkout);
  git(checkout, 'checkout', '-b', 'main');
  commit(checkout, 'first');
  git(checkout, 'push', '-u', 'origin', 'main');
  git(scratch, 'clone', remote, other);
  writeUpdateSource(data, { checkout });
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('synced checkout', () => {
  it('returns the tip and installs when the checkout is already current', async () => {
    const head = git(checkout, 'rev-parse', 'HEAD');
    await expect(syncedCheckout(layout(), checkout, { install })).resolves.toBe(head);
    expect(install).toHaveBeenCalledExactlyOnceWith(checkout);
  });

  it('fast-forwards to a newer remote tip before installing', async () => {
    const tip = commit(other, 'second');
    git(other, 'push', 'origin', 'main');
    await expect(syncedCheckout(layout(), checkout, { install })).resolves.toBe(tip);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(tip);
    expect(readFileSync(join(checkout, 'second'), 'utf8')).toBe('second');
    expect(install).toHaveBeenCalledOnce();
  });

  it('refuses a dirty tree and tells the owner to commit and push', async () => {
    writeFileSync(join(checkout, 'first'), 'changed');
    await expect(syncedCheckout(layout(), checkout, { install })).rejects.toThrow(
      /uncommitted changes: commit and push first/u,
    );
    expect(install).not.toHaveBeenCalled();
  });

  it('refuses a checkout that is ahead of the remote', async () => {
    commit(checkout, 'local');
    await expect(syncedCheckout(layout(), checkout, { install })).rejects.toThrow(/push first/u);
    expect(install).not.toHaveBeenCalled();
  });

  it('refuses a diverged checkout', async () => {
    commit(other, 'remote-side');
    git(other, 'push', 'origin', 'main');
    commit(checkout, 'local-side');
    await expect(syncedCheckout(layout(), checkout, { install })).rejects.toThrow(/diverged/u);
    expect(install).not.toHaveBeenCalled();
  });

  it('refuses a checkout on another branch', async () => {
    git(checkout, 'checkout', '-b', 'topic');
    await expect(syncedCheckout(layout(), checkout, { install })).rejects.toThrow(
      /tracks main: switch it back/u,
    );
  });

  it('refuses a root that is not the configured checkout', async () => {
    await expect(syncedCheckout(layout(), other, { install })).rejects.toThrow(SyncedCheckoutError);
  });

  it('names the configure tool when no update source is configured', async () => {
    const empty = join(scratch, 'empty-data');
    mkdirSync(empty);
    writeFileSync(
      dataLayoutOf(empty).system.config.service,
      JSON.stringify({ go2rtcBinary: '/opt/go2rtc' }),
    );
    await expect(syncedCheckout(dataLayoutOf(empty), checkout, { install })).rejects.toThrow(
      /configure-update-source/u,
    );
  });
});
