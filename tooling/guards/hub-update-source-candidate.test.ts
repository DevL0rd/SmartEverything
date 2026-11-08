import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hubPendingIdentity,
  pendingFiles,
  prepareHubUpdateCandidate,
} from '../hub-update-candidate.ts';
import { assertSavedBranch } from '../hub-update-save-command.ts';
import { savePendingTrees } from '../hub-update-save-trees.ts';
import { checkHubUpdateSource } from '../hub-update-source.ts';
import { candidateIdentity } from '../self-update-candidate-identity.ts';
import { commit, fixture, git, useHubSourceFixture, write } from './hub-update-source-fixture.ts';

useHubSourceFixture();

describe('preparing an update candidate from a configured Git fork', () => {
  it('builds an isolated candidate with remote changes and pending files while leaving the real index and branch untouched', async () => {
    write(fixture.upstream, 'shared.txt', 'from upstream\n');
    await commit(fixture.upstream, 'new upstream release');
    write(fixture.source.folder, 'local.txt', 'staged local change\n');
    await git(fixture.source.folder, 'add', 'local.txt');
    write(fixture.source.folder, 'local.txt', 'further local change\n');
    write(fixture.source.folder, 'untracked.txt', 'local only\n');
    write(fixture.source.folder, 'private.env', 'excluded\n');
    const index = readFileSync(join(fixture.source.folder, '.git', 'index'));
    const offer = await checkHubUpdateSource(fixture.source);
    expect(offer.tip).not.toBe(offer.head);
    expect(offer.hasPendingFiles).toBe(true);

    const candidate = await prepareHubUpdateCandidate(offer, fixture.scratch, true);
    expect(readFileSync(join(candidate, 'shared.txt'), 'utf8')).toBe('from upstream\n');
    expect(readFileSync(join(candidate, 'local.txt'), 'utf8')).toBe('further local change\n');
    expect(readFileSync(join(candidate, 'untracked.txt'), 'utf8')).toBe('local only\n');
    expect(existsSync(join(candidate, 'private.env'))).toBe(false);
    expect(readFileSync(join(fixture.source.folder, 'shared.txt'), 'utf8')).toBe('original\n');
    expect(readFileSync(join(fixture.source.folder, '.git', 'index'))).toEqual(index);
    expect((await git(fixture.source.folder, 'rev-parse', 'HEAD')).trim()).toBe(offer.head);
  });

  it('requires an explicit choice to carry pending changes', async () => {
    write(fixture.source.folder, 'untracked.txt', 'keep me\n');
    const offer = await checkHubUpdateSource(fixture.source);
    await expect(prepareHubUpdateCandidate(offer, fixture.scratch, false)).rejects.toMatchObject({
      code: 'pending',
    });
  });

  it('detects changes to an approved local file even when the remote tip ignores it', async () => {
    const name = 'local-input[1].txt';
    write(fixture.source.folder, name, 'reviewed input');
    write(fixture.upstream, '.gitignore', 'private.env\nlocal-input*.txt\n');
    await commit(fixture.upstream, 'ignore local build inputs');
    const offer = await checkHubUpdateSource(fixture.source);
    const candidate = await prepareHubUpdateCandidate(offer, fixture.scratch, true);
    const reviewed = await candidateIdentity(candidate);
    expect(readFileSync(join(candidate, name), 'utf8')).toBe('reviewed input');

    write(candidate, name, 'modified input');

    expect(await candidateIdentity(candidate)).not.toBe(reviewed);
  });

  it('refuses a fetched branch that moved after checking', async () => {
    const offer = await checkHubUpdateSource(fixture.source);
    write(fixture.upstream, 'shared.txt', 'newer tip\n');
    await commit(fixture.upstream, 'advanced after check');
    await expect(prepareHubUpdateCandidate(offer, fixture.scratch, false)).rejects.toMatchObject({
      code: 'changed',
    });
  });

  it('refuses an untracked edit made after review even when the file count is unchanged', async () => {
    write(fixture.source.folder, 'pending.txt', 'first');
    const offer = await checkHubUpdateSource(fixture.source);
    const reviewed = await hubPendingIdentity(fixture.source.folder);
    write(fixture.source.folder, 'pending.txt', 'other');
    await expect(
      prepareHubUpdateCandidate(offer, fixture.scratch, true, reviewed),
    ).rejects.toMatchObject({
      code: 'changed',
    });
  });

  it('refuses a different staged layer even when the final working file is unchanged', async () => {
    write(fixture.source.folder, 'local.txt', 'stage first');
    await git(fixture.source.folder, 'add', 'local.txt');
    write(fixture.source.folder, 'local.txt', 'working');
    const offer = await checkHubUpdateSource(fixture.source);
    const reviewed = await hubPendingIdentity(fixture.source.folder);
    write(fixture.source.folder, 'local.txt', 'stage other');
    await git(fixture.source.folder, 'add', 'local.txt');
    write(fixture.source.folder, 'local.txt', 'working');
    await expect(
      prepareHubUpdateCandidate(offer, fixture.scratch, true, reviewed),
    ).rejects.toMatchObject({
      code: 'changed',
    });
  });

  it('refuses diverged local commits without changing the source ref', async () => {
    write(fixture.upstream, 'shared.txt', 'remote changes');
    await commit(fixture.upstream, 'remote advance');
    write(fixture.source.folder, 'local.txt', 'local commit');
    await commit(fixture.source.folder, 'local advance');
    const offer = await checkHubUpdateSource(fixture.source);
    await expect(prepareHubUpdateCandidate(offer, fixture.scratch, false)).rejects.toMatchObject({
      code: 'diverged',
    });
    expect((await git(fixture.source.folder, 'rev-parse', 'HEAD')).trim()).toBe(offer.head);
  });

  it('refuses to fetch a different configured remote than the one that was checked', async () => {
    const offer = await checkHubUpdateSource(fixture.source);
    await git(
      fixture.source.folder,
      'remote',
      'set-url',
      'origin',
      join(fixture.scratch, 'another-fork'),
    );
    await expect(prepareHubUpdateCandidate(offer, fixture.scratch, false)).rejects.toMatchObject({
      code: 'changed',
    });
  });

  it('refuses competing tracked edits without changing the source checkout', async () => {
    write(fixture.upstream, 'shared.txt', 'upstream edit\n');
    await commit(fixture.upstream, 'conflicting upstream');
    write(fixture.source.folder, 'shared.txt', 'private edit\n');
    const offer = await checkHubUpdateSource(fixture.source);
    await expect(prepareHubUpdateCandidate(offer, fixture.scratch, true)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(readFileSync(join(fixture.source.folder, 'shared.txt'), 'utf8')).toBe('private edit\n');
  });

  it('does not carry local files through a new remote symlink', async () => {
    const local = join(fixture.source.folder, 'local.txt');
    symlinkSync(fixture.scratch, join(fixture.upstream, 'dir'));
    await commit(fixture.upstream, 'remote symlink');
    mkdirSync(join(fixture.source.folder, 'dir'));
    write(join(fixture.source.folder, 'dir'), 'escaped.txt', 'do not overwrite\n');
    const offer = await checkHubUpdateSource(fixture.source);
    await expect(prepareHubUpdateCandidate(offer, fixture.scratch, true)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(existsSync(join(fixture.scratch, 'escaped.txt'))).toBe(false);
    expect(readFileSync(local, 'utf8')).toBe('base\n');
  });
});

it('restores staged, working and untracked changes from a local recovery commit', async () => {
  const { folder } = fixture.source;
  await git(folder, 'config', 'user.name', 'Fixture');
  await git(folder, 'config', 'user.email', 'fixture@example.invalid');
  write(folder, 'local.txt', 'staged local content\n');
  await git(folder, 'add', 'local.txt');
  write(folder, 'local.txt', 'different working content\n');
  writeFileSync(join(folder, 'untracked.bin'), Buffer.from([0, 255, 1]));
  write(folder, 'run fixture.sh', '#!/bin/sh\n');
  chmodSync(join(folder, 'run fixture.sh'), 0o755);
  symlinkSync('untracked.bin', join(folder, 'fixture-link'));
  write(folder, 'private.env', 'ignored');
  const index = readFileSync(join(folder, '.git', 'index'));
  const base = (await git(folder, 'rev-parse', 'HEAD')).trim();
  const pending = await pendingFiles(folder);
  const snapshot = await savePendingTrees(folder, fixture.scratch, base, pending);
  await git(folder, 'update-ref', 'refs/heads/recovery/fixture', snapshot);
  const restored = join(fixture.scratch, 'restored');
  await git(fixture.scratch, 'clone', '--no-hardlinks', '--branch', 'main', folder, restored);
  await git(restored, 'stash', 'apply', '--index', 'refs/remotes/origin/recovery/fixture');
  expect((await pendingFiles(restored)).identity).toBe(pending.identity);
  expect((await git(folder, 'rev-parse', 'HEAD')).trim()).toBe(base);
  expect(readFileSync(join(folder, '.git', 'index'))).toEqual(index);
  expect((await pendingFiles(folder)).identity).toBe(pending.identity);
  expect(existsSync(join(restored, 'private.env'))).toBe(false);
});

it('prepares a remote-only candidate when the reviewed pending snapshot remains saved', async () => {
  const { folder } = fixture.source;
  await git(folder, 'config', 'user.name', 'Fixture');
  await git(folder, 'config', 'user.email', 'fixture@example.invalid');
  write(fixture.upstream, 'shared.txt', 'new remote content');
  await commit(fixture.upstream, 'remote update');
  write(folder, 'local.txt', 'keep this in the live checkout');
  write(folder, 'untracked.txt', 'keep this too');
  const offer = await checkHubUpdateSource(fixture.source);
  const pending = await pendingFiles(folder);
  const saved = {
    branch: 'recovery/fixture',
    commit: await savePendingTrees(folder, fixture.scratch, offer.head, pending),
  };
  await git(folder, 'update-ref', `refs/heads/${saved.branch}`, saved.commit);
  const review = {
    identity: pending.identity,
    checkSaved: (): Promise<void> => assertSavedBranch(folder, saved),
  };
  const candidate = await prepareHubUpdateCandidate(offer, fixture.scratch, false, review);
  expect(readFileSync(join(candidate, 'shared.txt'), 'utf8')).toBe('new remote content');
  expect(readFileSync(join(candidate, 'local.txt'), 'utf8')).toBe('base\n');
  expect(existsSync(join(candidate, 'untracked.txt'))).toBe(false);
  expect(await hubPendingIdentity(folder)).toBe(pending.identity);
  await git(folder, 'update-ref', `refs/heads/${saved.branch}`, offer.head);
  await expect(
    prepareHubUpdateCandidate(offer, fixture.scratch, false, review),
  ).rejects.toMatchObject({
    code: 'changed',
  });
});
