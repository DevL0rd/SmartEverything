import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SELF_UPDATE_ROOT } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { checkConfiguredSource } from '../hub-update-source-command.ts';
import {
  commit,
  fixture,
  git,
  REVIEWER_ID,
  useHubSourceFixture,
  write,
} from './hub-update-source-fixture.ts';

useHubSourceFixture();

describe('preparing an update from a configured Git fork', () => {
  it('offers a newly advanced branch on the next owner check and reuses an unchanged offer', async () => {
    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '1');
    const reviewer = { data: fixture.scratch, client: REVIEWER_ID };
    const { folder, remote, branch } = fixture.source;
    const settings = { remote, branch };
    const before = await checkConfiguredSource(folder, settings, reviewer);
    expect(before.relation).toBe('same');
    expect(before).not.toHaveProperty('offerId');

    write(fixture.upstream, 'shared.txt', 'next upstream release');
    await commit(fixture.upstream, 'advance the configured branch');
    const tip = (await git(fixture.upstream, 'rev-parse', 'HEAD')).trim();
    const withoutReviewer = await checkConfiguredSource(folder, settings);
    expect(withoutReviewer).toMatchObject({
      tip,
      relation: 'remote_ahead',
      availableUpdate: 'source_ahead',
      applyBlockedBy: 'owner_required',
    });
    expect(withoutReviewer).not.toHaveProperty('offerId');

    const offer = await checkConfiguredSource(folder, settings, reviewer);
    expect(offer).toMatchObject({ tip, relation: 'remote_ahead', availableUpdate: 'source_ahead' });
    expect(offer).not.toHaveProperty('applyBlockedBy');
    expect(offer.offerId).toBeTypeOf('string');
    await expect(checkConfiguredSource(folder, settings, reviewer)).resolves.toEqual(offer);
    expect((await git(folder, 'rev-parse', 'refs/remotes/origin/main')).trim()).toBe(before.head);
  });

  it('does not record a new offer when the advertised tip is already running', async () => {
    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '1');
    write(fixture.upstream, 'shared.txt', 'running upstream content');
    await commit(fixture.upstream, 'running release');
    const runningTip = (await git(fixture.upstream, 'rev-parse', 'HEAD')).trim();
    const reviewer = { data: fixture.scratch, client: REVIEWER_ID };
    const { folder, remote, branch } = fixture.source;
    const check = await checkConfiguredSource(folder, { remote, branch }, reviewer, { runningTip });
    expect(check).toMatchObject({ tip: runningTip, relation: 'remote_ahead', tipIsRunning: true });
    expect(check).not.toHaveProperty('offerId');
    expect(existsSync(join(fixture.scratch, SELF_UPDATE_ROOT))).toBe(false);
  });

  it('does not offer a remote tip when the recorded running commit cannot be compared', async () => {
    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '1');
    await git(fixture.upstream, 'switch', '-c', 'retired');
    write(fixture.upstream, 'shared.txt', 'running content from a retired history');
    await commit(fixture.upstream, 'running release');
    const runningTip = (await git(fixture.upstream, 'rev-parse', 'HEAD')).trim();
    await git(fixture.upstream, 'switch', 'main');
    write(fixture.upstream, 'shared.txt', 'replacement history');
    await commit(fixture.upstream, 'advance the configured branch');
    const reviewer = { data: fixture.scratch, client: REVIEWER_ID };
    const { folder, remote, branch } = fixture.source;
    const check = await checkConfiguredSource(folder, { remote, branch }, reviewer, { runningTip });
    expect(check.relation).toBe('remote_ahead');
    expect(check).not.toHaveProperty('availableUpdate');
    expect(check).not.toHaveProperty('offerId');
    expect(existsSync(join(fixture.scratch, SELF_UPDATE_ROOT))).toBe(false);
  });

  it('reports a newer release without making an offer on an unsupported host', async () => {
    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '1');
    const { folder, remote, branch } = fixture.source;
    const runningTip = (await git(folder, 'rev-parse', 'HEAD')).trim();
    write(fixture.upstream, 'shared.txt', 'newer than the running release');
    await commit(fixture.upstream, 'advance the configured branch');
    const reviewer = { data: fixture.scratch, client: REVIEWER_ID };
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const check = await checkConfiguredSource(folder, { remote, branch }, reviewer, {
        runningTip,
      });
      expect(check).toMatchObject({
        availableUpdate: 'running_behind',
        applyBlockedBy: 'unsupported_host',
      });
      expect(check).not.toHaveProperty('offerId');
      expect(existsSync(join(fixture.scratch, SELF_UPDATE_ROOT))).toBe(false);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('reports the update even when the hub cannot apply it', async () => {
    const { folder, remote, branch } = fixture.source;
    const reviewer = { data: fixture.scratch, client: REVIEWER_ID };
    write(fixture.upstream, 'shared.txt', 'next upstream release');
    await commit(fixture.upstream, 'advance the configured branch');

    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '0');
    const disabled = await checkConfiguredSource(folder, { remote, branch }, reviewer);
    expect(disabled).toMatchObject({
      availableUpdate: 'source_ahead',
      applyBlockedBy: 'remote_apply_disabled',
    });
    expect(disabled).not.toHaveProperty('offerId');

    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '1');
    await git(folder, 'switch', '--detach');
    const detached = await checkConfiguredSource(folder, { remote, branch }, reviewer);
    expect(detached).toMatchObject({
      availableUpdate: 'source_ahead',
      applyBlockedBy: 'tracked_branch_required',
    });
    expect(detached).not.toHaveProperty('offerId');
    expect(existsSync(join(fixture.scratch, SELF_UPDATE_ROOT))).toBe(false);
  });

  it('offers an already-pulled update when its tip descends from the running release', async () => {
    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '1');
    const { folder, remote, branch } = fixture.source;
    const reviewer = { data: fixture.scratch, client: REVIEWER_ID };
    const runningTip = (await git(folder, 'rev-parse', 'HEAD')).trim();
    write(fixture.upstream, 'shared.txt', 'newer than the running release');
    await commit(fixture.upstream, 'advance the configured branch');
    await git(folder, 'pull', '--ff-only');

    const unknown = await checkConfiguredSource(folder, { remote, branch }, reviewer);
    expect(unknown.relation).toBe('same');
    expect(unknown).not.toHaveProperty('availableUpdate');
    expect(unknown).not.toHaveProperty('offerId');
    const check = await checkConfiguredSource(folder, { remote, branch }, reviewer, { runningTip });
    expect(check).toMatchObject({ relation: 'same', availableUpdate: 'running_behind' });
    expect(check.offerId).toBeTypeOf('string');
    await expect(
      checkConfiguredSource(folder, { remote, branch }, reviewer, { runningTip: check.tip }),
    ).resolves.toMatchObject({ relation: 'same', tipIsRunning: true });
  });

  it('reports a newer deployed source comparison but blocks a diverged checkout', async () => {
    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '1');
    const { folder, remote, branch } = fixture.source;
    const reviewer = { data: fixture.scratch, client: REVIEWER_ID };
    const runningTip = (await git(folder, 'rev-parse', 'HEAD')).trim();
    write(fixture.upstream, 'shared.txt', 'upstream advance');
    await commit(fixture.upstream, 'advance the configured branch');
    write(folder, 'local.txt', 'local advance');
    await commit(folder, 'advance the local checkout independently');

    const check = await checkConfiguredSource(folder, { remote, branch }, reviewer, { runningTip });
    expect(check).toMatchObject({
      relation: 'diverged',
      availableUpdate: 'running_behind',
      applyBlockedBy: 'checkout_not_ancestor',
    });
    expect(check).not.toHaveProperty('offerId');
  });

  it('checks the exact remote tip without fetching it or changing staged files', async () => {
    write(fixture.upstream, 'shared.txt', 'new upstream content');
    await commit(fixture.upstream, 'release on fork');
    await git(fixture.source.folder, 'mv', 'local.txt', 'staged.txt');
    write(fixture.source.folder, 'staged.txt', 'unstaged content');
    write(fixture.source.folder, 'secret-file.txt', 'not in response');
    const index = readFileSync(join(fixture.source.folder, '.git', 'index'));
    const head = (await git(fixture.source.folder, 'rev-parse', 'HEAD')).trim();
    const tip = (await git(fixture.upstream, 'rev-parse', 'HEAD')).trim();
    const check = await checkConfiguredSource(fixture.source.folder, {
      remote: fixture.source.remote,
      branch: fixture.source.branch,
    });
    expect(check).toEqual({
      head,
      tip,
      relation: 'remote_ahead',
      availableUpdate: 'source_ahead',
      applyBlockedBy: 'owner_required',
      remote: 'origin',
      branch: 'main',
      pending: { staged: 1, unstaged: 1, untracked: 1, conflicts: 0 },
    });
    expect((await git(fixture.source.folder, 'rev-parse', 'refs/remotes/origin/main')).trim()).toBe(
      head,
    );
    expect(readFileSync(join(fixture.source.folder, '.git', 'index'))).toEqual(index);
  });
});
