import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import { gitSourceOf } from '../../src/harness/extension-source';
import { useRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

let repository: string;
beforeEach(async () => {
  repository = await mkdtemp(join(tmpdir(), 'extension-source-'));
});
afterEach(async () => {
  await rm(repository, { recursive: true, force: true });
});

const SKILL = (name: string, body: string): string =>
  `---\nname: ${name}\ndescription: ${name} instructions.\nlicense: MIT\n---\n\n${body}\n`;

async function put(files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(repository, path)), { recursive: true });
    await writeFile(join(repository, path), content);
  }
}

function git(...args: string[]): void {
  execFileSync(
    'git',
    ['-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', ...args],
    { stdio: 'pipe' },
  );
}

async function commit(files: Readonly<Record<string, string>>): Promise<void> {
  await put(files);
  git('init', '--quiet');
  git('add', '-A');
  git('commit', '--quiet', '-m', 'fixture');
}

const MARKETPLACE = {
  '.claude-plugin/marketplace.json': JSON.stringify({
    name: 'fixture-market',
    owner: { name: 'Fixture Inc' },
    plugins: [
      { name: 'tools', description: 'Tools with hooks.', source: './plugins/tools' },
      { name: 'notes', description: 'Notes only.', source: './plugins/notes', license: 'MIT' },
    ],
  }),
  'plugins/tools/.claude-plugin/plugin.json': JSON.stringify({ name: 'tools' }),
  'plugins/tools/hooks/hooks.json': JSON.stringify({ hooks: {} }),
  'plugins/tools/skills/lint/SKILL.md': SKILL('lint', 'Run the linter.'),
  'plugins/notes/skills/note/SKILL.md': SKILL('note', 'Write short notes.'),
  'skills/standalone/SKILL.md': SKILL('standalone', 'Stand alone.'),
};

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
  it('lists the plugins of a git marketplace and what to install for each, with no network', async () => {
    await commit(MARKETPLACE);

    const page = await rig.service.discovery.browse({
      kind: 'extension',
      source: { url: repository },
    });

    expect(page.source.label).toBe('fixture-market');
    expect(page.items.map((item) => item.name)).toEqual(['tools', 'notes']);
    expect(page.items[0]?.install).toMatchObject({
      source: { url: repository, path: 'plugins/tools' },
      select: ['tools'],
    });
  });

  it('lists plain skills of a repository that has no marketplace', async () => {
    await commit({ 'skills/a/SKILL.md': SKILL('a', 'A.'), 'skills/b/SKILL.md': SKILL('b', 'B.') });

    const page = await rig.service.discovery.browse({
      kind: 'skill',
      source: { url: repository },
    });

    expect(page.items.map((item) => item.name)).toEqual(['a', 'b']);
  });

  it('says the source is unavailable, not that something changed, when git cannot reach it', async () => {
    const error = await rig.service.discovery
      .browse({ kind: 'skill', source: { url: join(repository, 'missing') } })
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
    await commit(market(plugin));

    await expect(
      rig.service.discovery.browse({ kind: 'extension', source: { url: repository } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      rig.service.extensions.install({ source: { url: repository }, select: ['up'] }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(installed()).toEqual([]);
  });

  it('refuses a symlinked folder and keeps the catalogue listing', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'extension-outside-'));
    await writeFile(join(outside, 'secret.txt'), 'private');
    await put(market({ name: 'link', source: './evil' }));
    await symlink(outside, join(repository, 'evil'));
    git('init', '--quiet');
    git('add', '-A');
    git('commit', '--quiet', '-m', 'fixture');

    await expect(
      rig.service.extensions.install({ source: { url: repository }, select: ['link'] }),
    ).rejects.toMatchObject({ code: 'invalid_request' });

    expect(installed()).toEqual([]);
    expect(rig.service.extensions.catalogue().items.length).toBeGreaterThan(0);
    await expect(stat(join(outside, '.claude-plugin'))).rejects.toThrow();
    await rm(outside, { recursive: true, force: true });
  });
});

describe('installing from a git source', () => {
  it('installs a skill, makes it part of the shared configuration and keeps its files on the hub', async () => {
    await commit(MARKETPLACE);

    const [item] = await rig.service.extensions.install({
      source: { url: repository, path: 'skills/standalone' },
    });

    expect(item).toMatchObject({ id: 'skill:standalone', enabled: true, executes: false });
    expect(assetIds('skills')).toEqual(['skill:standalone']);
    const tree = await rig.service.extensions.tree(
      'skill',
      'skill:standalone',
      item?.version ?? '',
    );
    expect(tree.files.map((file) => file.path)).toEqual(['SKILL.md']);
  });

  it('refuses a plugin with hooks until the owner confirms it, then runs it from the next configuration', async () => {
    await commit(MARKETPLACE);
    const request = { source: { url: repository }, select: ['tools'] };

    await expect(rig.service.extensions.install(request)).rejects.toThrow(/Confirm to install/u);
    expect(installed()).toEqual([]);

    const [item] = await rig.service.extensions.install({ ...request, confirm_executes: true });

    expect(item).toMatchObject({ id: 'plugin:tools', executes: true, confirmed: true });
    const desired = rig.service.configuration
      .desired()
      .entries.find((entry) => entry.id === 'claude-plugins');
    expect(desired?.metadata?.skill_assets).toEqual([
      { id: 'plugin:tools', version: item?.version, executes: true },
    ]);
  });

  it('installs a plugin without hooks with no confirmation', async () => {
    await commit(MARKETPLACE);

    const [item] = await rig.service.extensions.install({
      source: { url: repository },
      select: ['notes'],
    });

    expect(item).toMatchObject({ id: 'plugin:notes', executes: false, license: 'MIT' });
  });

  it('asks which one to install when the source offers several', async () => {
    await commit(MARKETPLACE);

    await expect(rig.service.extensions.install({ source: { url: repository } })).rejects.toThrow(
      /choose which to install/u,
    );
  });

  it('removes an installed skill with its files and its place in the configuration', async () => {
    await commit(MARKETPLACE);
    const [item] = await rig.service.extensions.install({
      source: { url: repository, path: 'skills/standalone' },
    });
    const before = rig.service.configuration.desired().revision;

    await rig.service.extensions.remove('skill:standalone');

    expect(installed()).toEqual([]);
    expect(assetIds('skills')).toEqual([]);
    expect(rig.service.configuration.desired().revision).not.toBe(before);
    await expect(
      rig.service.extensions.tree('skill', 'skill:standalone', item?.version ?? ''),
    ).rejects.toThrow(/changed on the Home Hub/u);
  });
});

describe('switching and writing skills and plugins', () => {
  it('switches one skill off and on again without touching the others', async () => {
    await commit({
      'skills/a/SKILL.md': SKILL('a', 'A.'),
      'skills/b/SKILL.md': SKILL('b', 'B.'),
    });
    await rig.service.extensions.install({ source: { url: repository }, select: ['a', 'b'] });

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
    await commit({ 'skills/a/SKILL.md': SKILL('a', 'One.') });
    const [first] = await rig.service.extensions.install({
      source: { url: repository, path: 'skills/a' },
    });

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 0,
      unchanged: 1,
      skipped: 0,
    });

    await put({ 'skills/a/SKILL.md': SKILL('a', 'Two.') });
    git('commit', '--quiet', '-am', 'edit');

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 1,
      unchanged: 0,
      skipped: 0,
    });
    const [after] = rig.service.extensions
      .catalogue()
      .items.filter((item) => item.id === 'skill:a');
    expect(after?.version).not.toBe(first?.version);
    const tree = await rig.service.extensions.tree('skill', 'skill:a', after?.version ?? '');
    expect(Buffer.from(tree.files[0]?.base64 ?? '', 'base64').toString()).toContain('Two.');
  });

  it('updates what was installed from Browse, because it follows the branch and not the browsed snapshot', async () => {
    await commit({ 'skills/a/SKILL.md': SKILL('a', 'One.') });
    const page = await rig.service.discovery.browse({
      kind: 'skill',
      source: { url: repository },
    });
    const install = page.items[0]?.install;
    if (install === undefined) throw new Error('Browse offered nothing to install.');
    await rig.service.extensions.install(install);
    await put({ 'skills/a/SKILL.md': SKILL('a', 'Two.') });
    git('commit', '--quiet', '-am', 'edit');

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 1,
      unchanged: 0,
      skipped: 0,
    });
  });

  it('replaces the placeholder description of a moved plugin with the one in its manifest', async () => {
    await commit({
      'plugins/tools/.claude-plugin/plugin.json': JSON.stringify({
        name: 'tools',
        description: 'Real tools.',
        license: 'MIT',
      }),
      'plugins/tools/skills/lint/SKILL.md': SKILL('lint', 'Lint.'),
    });
    await rig.service.extensions.install({ source: { url: repository, path: 'plugins/tools' } });
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
    await commit(MARKETPLACE);
    await rig.service.extensions.install({ source: { url: repository }, select: ['notes'] });
    await put({ 'plugins/notes/skills/note/SKILL.md': SKILL('note', 'Changed.') });
    git('commit', '--quiet', '-am', 'edit');

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 1,
      unchanged: 0,
      skipped: 0,
    });
  });

  it('does not touch skills written in the app and keeps going when a source is gone', async () => {
    await commit({ 'skills/a/SKILL.md': SKILL('a', 'One.') });
    await rig.service.extensions.install({ source: { url: repository, path: 'skills/a' } });
    await rig.service.extensions.write('mine', {
      files: [{ path: 'SKILL.md', content: SKILL('mine', 'Mine.') }],
    });
    await rm(join(repository, '.git'), { recursive: true, force: true });

    expect(await rig.service.extensions.update('all')).toEqual({
      updated: 0,
      unchanged: 0,
      skipped: 2,
    });
    await expect(stat(join(repository, 'skills/a/SKILL.md'))).resolves.toBeDefined();
    expect(await readFile(join(repository, 'skills/a/SKILL.md'), 'utf8')).toContain('One.');
  });
});
