import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import { gitSourceOf } from '../../src/harness/extension-source';
import { useRig, type Rig } from '../assistant/harness/support/rig';
import { GitFixture, MARKETPLACE, SKILL, installOne, referenceOf } from './extension-fixture';

let rig: Rig;
useRig((made) => {
  rig = made;
});

let fixture: GitFixture;
beforeEach(async () => {
  fixture = new GitFixture(await mkdtemp(join(tmpdir(), 'extension-source-')));
});
afterEach(async () => {
  await rm(fixture.repository, { recursive: true, force: true });
});

function here(path?: string): { url: string; path?: string } {
  return path === undefined ? { url: fixture.repository } : { url: fixture.repository, path };
}

function installed(): readonly string[] {
  return rig.service.extensions
    .catalogue()
    .items.filter((item) => item.kind !== 'builtin')
    .map((item) => item.id);
}

function assetIds(kind: 'skills' | 'claude-plugins'): readonly string[] {
  const entry = rig.service.configuration.desired().entries.find((item) => item.id === kind);
  return entry?.metadata?.skill_assets.map((asset) => asset.id) ?? [];
}

describe('reading a git source', () => {
  it.each([
    ['https://github.com/anthropics/skills', 'https://github.com/anthropics/skills', null, null],
    ['anthropics/skills', 'https://github.com/anthropics/skills', null, null],
    [
      'https://github.com/anthropics/skills/tree/main/skills/pdf',
      'https://github.com/anthropics/skills',
      'main',
      'skills/pdf',
    ],
    [
      'https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md',
      'https://github.com/anthropics/skills',
      'main',
      'skills/pdf',
    ],
    [
      'https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md',
      'https://github.com/anthropics/skills',
      'main',
      'skills/pdf',
    ],
    ['https://example.test/team/skills.git', 'https://example.test/team/skills.git', null, null],
  ])('turns %s into a repository, a ref and a folder', (text, url, ref, path) => {
    expect(gitSourceOf({ url: text })).toEqual({ url, ref, path });
  });

  it('lets an explicit ref and folder win over the link', () => {
    expect(
      gitSourceOf({
        url: 'https://github.com/anthropics/skills/tree/main/skills/pdf',
        ref: 'v2',
        path: 'skills/docx',
      }),
    ).toEqual({ url: 'https://github.com/anthropics/skills', ref: 'v2', path: 'skills/docx' });
  });
});

describe('browsing a marketplace', () => {
  it('lists the plugins of a git marketplace with a reference to install each, with no network', async () => {
    await fixture.commit(MARKETPLACE);

    const page = await rig.service.discovery.browse({ kind: 'plugin', source: here() });

    expect(page.sources).toEqual([
      expect.objectContaining({
        source: here(),
        label: 'fixture-market',
        snapshot: fixture.head(),
      }),
    ]);
    expect(page.items.map((item) => item.name)).toEqual(['tools', 'notes']);
    expect(page.items[0]?.reference).toEqual({
      source: here(),
      snapshot: fixture.head(),
      id: 'plugin:tools',
      origin: { url: fixture.repository, ref: null, path: 'plugins/tools' },
    });
  });

  it('lists plain skills of a repository that has no marketplace', async () => {
    await fixture.commit({
      'skills/a/SKILL.md': SKILL('a', 'A.'),
      'skills/b/SKILL.md': SKILL('b', 'B.'),
    });

    const page = await rig.service.discovery.browse({ kind: 'skill', source: here() });

    expect(page.items.map((item) => item.name)).toEqual(['a', 'b']);
  });

  it('says the source is unavailable, not that something changed, when git cannot reach it', async () => {
    const error = await rig.service.discovery
      .browse({ kind: 'skill', source: { url: join(fixture.repository, 'missing') } })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'upstream_failed' });
  });
});

describe('a marketplace that points outside its repository', () => {
  const market = (plugin: object): Record<string, string> => ({
    '.claude-plugin/marketplace.json': JSON.stringify({ name: 'bad-market', plugins: [plugin] }),
    'skills/keep/SKILL.md': SKILL('keep', 'Kept.'),
  });

  it.each([
    ['a ../ folder', { name: 'up', source: './../../etc' }],
    ['a ../ skill', { name: 'up', source: './', skills: ['../../etc'] }],
    ['a name that is a path', { name: '../up', source: './skills' }],
  ])('refuses %s and writes nothing outside it', async (_label, plugin) => {
    await fixture.commit(market(plugin));

    await expect(
      rig.service.discovery.browse({ kind: 'plugin', source: here() }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    const { results } = await rig.service.extensions.install({
      items: [{ source: here(), snapshot: fixture.head(), id: 'plugin:up' }],
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(installed()).toEqual([]);
  });

  it('refuses a symlinked folder and keeps the catalogue listing', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'extension-outside-'));
    await writeFile(join(outside, 'secret.txt'), 'private');
    await fixture.put(market({ name: 'link', source: './evil' }));
    await symlink(outside, join(fixture.repository, 'evil'));
    fixture.git('init', '--quiet');
    fixture.git('add', '-A');
    fixture.git('commit', '--quiet', '-m', 'fixture');

    const { results } = await rig.service.extensions.install({
      items: [{ source: here(), snapshot: fixture.head(), id: 'plugin:link' }],
    });

    expect(results[0]).toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    expect(installed()).toEqual([]);
    expect(rig.service.extensions.catalogue().items.length).toBeGreaterThan(0);
    await expect(stat(join(outside, '.claude-plugin'))).rejects.toThrow();
    await rm(outside, { recursive: true, force: true });
  });
});

describe('installing from a git source', () => {
  it('installs a skill, makes it part of the shared configuration and keeps its files on the hub', async () => {
    await fixture.commit(MARKETPLACE);

    const item = await installOne(
      rig,
      await referenceOf(rig, 'skill:standalone', here('skills/standalone')),
    );

    expect(item).toMatchObject({ id: 'skill:standalone', enabled: true, executes: false });
    expect(assetIds('skills')).toEqual(['skill:standalone']);
    const tree = await rig.service.extensions.tree('skill', 'skill:standalone', item.version ?? '');
    expect(tree.files.map((file) => file.path)).toEqual(['SKILL.md']);
  });

  it('refuses a plugin with hooks until the owner confirms it, then runs it from the next configuration', async () => {
    await fixture.commit(MARKETPLACE);
    const reference = await referenceOf(rig, 'plugin:tools', here());

    await expect(installOne(rig, reference)).rejects.toThrow(/Confirm to install/u);
    expect(installed()).toEqual([]);

    const item = await installOne(rig, reference, true);

    expect(item).toMatchObject({ id: 'plugin:tools', executes: true, confirmed: true });
    const desired = rig.service.configuration
      .desired()
      .entries.find((entry) => entry.id === 'claude-plugins');
    expect(desired?.metadata?.skill_assets).toEqual([
      { id: 'plugin:tools', version: item.version, executes: true },
    ]);
  });

  it('installs a plugin without hooks with no confirmation', async () => {
    await fixture.commit(MARKETPLACE);

    const item = await installOne(rig, await referenceOf(rig, 'plugin:notes', here()));

    expect(item).toMatchObject({ id: 'plugin:notes', executes: false, license: 'MIT' });
  });

  it('removes an installed skill with its files and its place in the configuration', async () => {
    await fixture.commit(MARKETPLACE);
    const item = await installOne(
      rig,
      await referenceOf(rig, 'skill:standalone', here('skills/standalone')),
    );
    const before = rig.service.configuration.desired().revision;

    await rig.service.extensions.remove('skill:standalone');

    expect(installed()).toEqual([]);
    expect(assetIds('skills')).toEqual([]);
    expect(rig.service.configuration.desired().revision).not.toBe(before);
    await expect(
      rig.service.extensions.tree('skill', 'skill:standalone', item.version ?? ''),
    ).rejects.toThrow(/changed on the Home Hub/u);
  });
});

describe('switching and writing skills and plugins', () => {
  it('switches one skill off and on again without touching the others', async () => {
    await fixture.commit({
      'skills/a/SKILL.md': SKILL('a', 'A.'),
      'skills/b/SKILL.md': SKILL('b', 'B.'),
    });
    await rig.service.extensions.install({
      items: [await referenceOf(rig, 'skill:a', here()), await referenceOf(rig, 'skill:b', here())],
    });

    await rig.service.extensions.change('skill:a', { enabled: false });
    expect(assetIds('skills')).toEqual(['skill:b']);

    await rig.service.extensions.change('skill:a', { enabled: true });
    expect(assetIds('skills')).toEqual(['skill:a', 'skill:b']);
  });

  it('writes a skill from the editor and replaces it when written again', async () => {
    const first = await rig.service.extensions.write('my-skill', {
      files: [{ path: 'SKILL.md', content: SKILL('my-skill', 'Version one.') }],
    });
    const second = await rig.service.extensions.write('my-skill', {
      files: [
        { path: 'SKILL.md', content: SKILL('my-skill', 'Version two.') },
        { path: 'notes/extra.md', content: 'More.' },
      ],
    });

    expect(first.source).toEqual({ kind: 'editor' });
    expect(second.version).not.toBe(first.version);
    const tree = await rig.service.extensions.tree('skill', 'skill:my-skill', second.version ?? '');
    expect(tree.files.map((file) => file.path).sort()).toEqual(['SKILL.md', 'notes/extra.md']);
  });

  it('refuses a SKILL.md that names a different skill', async () => {
    await expect(
      rig.service.extensions.write('my-skill', {
        files: [{ path: 'SKILL.md', content: SKILL('other', 'Nope.') }],
      }),
    ).rejects.toThrow(/must name the skill "my-skill"/u);
  });

  it('keeps a built-in extension installed when it is switched off and lets it be switched on', async () => {
    const off = await rig.service.extensions.change('browser', { enabled: false });

    expect(off.enabled).toBe(false);
    await expect(rig.service.extensions.remove('browser')).rejects.toThrow(/stay installed/u);
    expect((await rig.service.extensions.change('browser', { enabled: true })).enabled).toBe(true);
  });
});

describe('updating from the source', () => {
  it('fetches a newer version of a git skill and leaves unchanged ones alone', async () => {
    await fixture.commit({ 'skills/a/SKILL.md': SKILL('a', 'One.') });
    const first = await installOne(rig, await referenceOf(rig, 'skill:a', here('skills/a')));

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 0,
      unchanged: 1,
      skipped: 0,
    });

    await fixture.change({ 'skills/a/SKILL.md': SKILL('a', 'Two.') });

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 1,
      unchanged: 0,
      skipped: 0,
    });
    const [after] = rig.service.extensions
      .catalogue()
      .items.filter((item) => item.id === 'skill:a');
    expect(after?.version).not.toBe(first.version);
    const tree = await rig.service.extensions.tree('skill', 'skill:a', after?.version ?? '');
    expect(Buffer.from(tree.files[0]?.base64 ?? '', 'base64').toString()).toContain('Two.');
  });

  it('updates what was installed from Browse, because it follows the branch and not the browsed snapshot', async () => {
    await fixture.commit({ 'skills/a/SKILL.md': SKILL('a', 'One.') });
    await installOne(rig, await referenceOf(rig, 'skill:a', here()));
    await fixture.change({ 'skills/a/SKILL.md': SKILL('a', 'Two.') });

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 1,
      unchanged: 0,
      skipped: 0,
    });
  });

  it('replaces the placeholder description of a moved plugin with the one in its manifest', async () => {
    await fixture.commit({
      'plugins/tools/.claude-plugin/plugin.json': JSON.stringify({
        name: 'tools',
        description: 'Real tools.',
        license: 'MIT',
      }),
      'plugins/tools/skills/lint/SKILL.md': SKILL('lint', 'Lint.'),
    });
    await installOne(rig, await referenceOf(rig, 'plugin:tools', here('plugins/tools')));
    const row = rig.opened.store.harnessExtensions.find('plugin:tools');
    if (row === undefined) throw new Error('The plugin was not installed.');
    rig.opened.store.harnessExtensions.keep({
      ...row,
      version: null,
      description: 'Installed from team/repo; details load when it is next fetched.',
      license: null,
    });

    await rig.service.extensions.update('missing');

    const after = rig.service.extensions.catalogue().items.find((i) => i.id === 'plugin:tools');
    expect(after).toMatchObject({ description: 'Real tools.', license: 'MIT' });
  });

  it('fetches a newer version of a marketplace plugin whose folder has no manifest', async () => {
    await fixture.commit(MARKETPLACE);
    await installOne(rig, await referenceOf(rig, 'plugin:notes', here()));
    await fixture.change({ 'plugins/notes/skills/note/SKILL.md': SKILL('note', 'Changed.') });

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 1,
      unchanged: 0,
      skipped: 0,
    });
  });

  it('does not touch skills written in the app and keeps going when a source is gone', async () => {
    await fixture.commit({ 'skills/a/SKILL.md': SKILL('a', 'One.') });
    await installOne(rig, await referenceOf(rig, 'skill:a', here('skills/a')));
    await rig.service.extensions.write('mine', {
      files: [{ path: 'SKILL.md', content: SKILL('mine', 'Mine.') }],
    });
    await rm(join(fixture.repository, '.git'), { recursive: true, force: true });

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 0,
      unchanged: 0,
      skipped: 2,
    });
    expect(await readFile(join(fixture.repository, 'skills/a/SKILL.md'), 'utf8')).toContain('One.');
  });
});
