import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASE_NOTES_MAX_LENGTH } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkConfiguredSource } from '../hub-update-source-command.ts';
import { gitSource, gitSourceText } from '../hub-update-source.ts';

const REVIEWER_ID = '38711789-95ba-42ab-ac91-d82a24f62ba6';
const SETTINGS = { remote: 'origin', branch: 'main' };
const NOTES_DIRECTORY = 'release-notes';
const NOTES_FILE = join(NOTES_DIRECTORY, 'hub.json');
const NOTES = 'Faster Hub startup\n\n- Load dashboards sooner.\n- Resume notifications on restart.';

let scratch: string;
let upstream: string;
let source: string;
let base: string;

function git(folder: string, ...args: string[]): Promise<string> {
  return gitSourceText(folder, args, 'prepare the release notes fixture');
}

async function commit(folder: string): Promise<string> {
  await git(folder, 'add', '-A');
  await git(
    folder,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'private development message',
  );
  return (await git(folder, 'rev-parse', 'HEAD')).trim();
}

async function publishNotes(content: string): Promise<string> {
  mkdirSync(join(upstream, NOTES_DIRECTORY), { recursive: true });
  writeFileSync(join(upstream, NOTES_FILE), content);
  return commit(upstream);
}

function ownerCheck(runningTip?: string): ReturnType<typeof checkConfiguredSource> {
  return checkConfiguredSource(
    source,
    SETTINGS,
    { data: scratch, client: REVIEWER_ID },
    { runningTip },
  );
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'hub-update-source-notes-'));
  upstream = join(scratch, 'upstream');
  source = join(scratch, 'source');
  await git(scratch, 'init', '-b', 'main', upstream);
  writeFileSync(join(upstream, 'hub.txt'), 'base');
  base = await commit(upstream);
  await git(scratch, 'clone', '--no-hardlinks', upstream, source);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
});

describe('authored Hub release notes', () => {
  it('returns the reviewed tip notes to a direct owner without reading local or commit message text', async () => {
    vi.stubEnv('SMARTEVERYTHING_SELF_UPDATE_ALLOW_REMOTE', '1');
    const tip = await publishNotes(JSON.stringify({ from: base, notes: NOTES }));
    mkdirSync(join(source, NOTES_DIRECTORY));
    writeFileSync(join(source, NOTES_FILE), 'private pending notes');

    const offer = await ownerCheck();
    expect(offer).toMatchObject({ tip, head: base, notes: NOTES, availableUpdate: 'source_ahead' });
    expect(offer.offerId).toBeTypeOf('string');
    await expect(ownerCheck()).resolves.toEqual(offer);
    const delegated = await checkConfiguredSource(source, SETTINGS);
    expect(delegated).not.toHaveProperty('notes');
    expect(await git(source, 'rev-parse', 'refs/remotes/origin/main')).toBe(`${base}\n`);
  });

  it('uses the verified installed release as the notes base after the source has caught up', async () => {
    const tip = await publishNotes(JSON.stringify({ from: base, notes: NOTES }));
    await git(source, 'pull', '--ff-only');

    const offer = await ownerCheck(base);
    expect(offer).toMatchObject({
      tip,
      head: tip,
      notes: NOTES,
      availableUpdate: 'running_behind',
    });
    await expect(ownerCheck(tip)).resolves.not.toHaveProperty('notes');
    await expect(ownerCheck()).resolves.not.toHaveProperty('notes');
  });

  it('omits notes inherited unchanged from the preceding tip', async () => {
    await publishNotes(JSON.stringify({ from: base, notes: NOTES }));
    writeFileSync(join(upstream, 'hub.txt'), 'changed since release notes');
    const tip = await commit(upstream);

    const offer = await ownerCheck();
    expect(offer).toMatchObject({ tip, availableUpdate: 'source_ahead' });
    expect(offer).not.toHaveProperty('notes');
  });

  it('requires fresh notes even when the source tip merges an earlier release', async () => {
    await git(upstream, 'switch', '-c', 'earlier-release');
    await publishNotes(JSON.stringify({ from: base, notes: NOTES }));
    await git(upstream, 'switch', 'main');
    writeFileSync(join(upstream, 'hub.txt'), 'main line change');
    await commit(upstream);
    await git(
      upstream,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'merge',
      '--no-ff',
      '--no-edit',
      'earlier-release',
    );
    const inheritedTip = (await git(upstream, 'rev-parse', 'HEAD')).trim();
    const inherited = await ownerCheck();
    expect(inherited).toMatchObject({ tip: inheritedTip, availableUpdate: 'source_ahead' });
    expect(inherited).not.toHaveProperty('notes');

    const freshNotes = 'Hub improvements from both branches';
    writeFileSync(join(upstream, NOTES_FILE), JSON.stringify({ from: base, notes: freshNotes }));
    await git(upstream, 'add', '--', NOTES_FILE);
    await git(
      upstream,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--amend',
      '--no-edit',
    );
    const authoredTip = (await git(upstream, 'rev-parse', 'HEAD')).trim();
    await expect(ownerCheck()).resolves.toMatchObject({ tip: authoredTip, notes: freshNotes });
  });

  it('preserves owner discovery without fetching trees omitted from the local object store', async () => {
    await git(upstream, 'config', 'uploadpack.allowFilter', 'true');
    await git(source, 'remote', 'set-url', 'origin', pathToFileURL(upstream).href);
    await git(source, 'config', 'remote.origin.promisor', 'true');
    const tip = await publishNotes(JSON.stringify({ from: base, notes: NOTES }));
    await git(source, 'fetch', '--filter=tree:0', 'origin', 'main');
    const tree = ['cat-file', '-e', `${tip}^{tree}`];
    expect((await gitSource(source, tree)).code).not.toBe(0);

    const offer = await ownerCheck();
    expect(offer).toMatchObject({ tip, availableUpdate: 'source_ahead' });
    expect(offer).not.toHaveProperty('notes');
    expect((await gitSource(source, tree)).code).not.toBe(0);
  });

  it.each([
    { reason: 'malformed', content: () => 'unstructured private data' },
    {
      reason: 'outside the declared range',
      content: () => JSON.stringify({ from: '0'.repeat(40), notes: NOTES }),
    },
    {
      reason: 'oversized',
      content: () =>
        JSON.stringify({ from: base, notes: 'x'.repeat(RELEASE_NOTES_MAX_LENGTH * 8) }),
    },
  ])('keeps the update available when notes are $reason', async ({ content }) => {
    const tip = await publishNotes(content());
    const offer = await ownerCheck();
    expect(offer).toMatchObject({ tip, availableUpdate: 'source_ahead' });
    expect(offer).not.toHaveProperty('notes');
  });

  it('does not follow a committed notes symlink', async () => {
    mkdirSync(join(upstream, NOTES_DIRECTORY));
    writeFileSync(join(upstream, 'linked.json'), JSON.stringify({ from: base, notes: NOTES }));
    symlinkSync('../linked.json', join(upstream, NOTES_FILE));
    const tip = await commit(upstream);

    const offer = await ownerCheck();
    expect(offer).toMatchObject({ tip, availableUpdate: 'source_ahead' });
    expect(offer).not.toHaveProperty('notes');
  });
});
