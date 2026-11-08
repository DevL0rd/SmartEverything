import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRig, type Rig } from '../assistant/harness/support/rig';
import { GitFixture, MARKETPLACE, SKILL, installOne, referenceOf } from './extension-fixture';

let rig: Rig;
useRig((made) => {
  rig = made;
});

let fixture: GitFixture;
beforeEach(async () => {
  fixture = new GitFixture(await mkdtemp(join(tmpdir(), 'extension-discovery-')));
});
afterEach(async () => {
  await rm(fixture.repository, { recursive: true, force: true });
});

function here(): { url: string } {
  return { url: fixture.repository };
}

const TOOLS_WITH_SERVERS = {
  ...MARKETPLACE,
  'plugins/tools/hooks/hooks.json': JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './bin/check.sh' }] }],
    },
  }),
  'plugins/tools/.mcp.json': JSON.stringify({
    mcpServers: {
      search: { command: 'node', args: ['server.js'], env: { SEARCH_TOKEN: 'set-me' } },
      remote: { type: 'http', url: 'https://mcp.example.test', headers: { Authorization: 'x' } },
    },
  }),
  'plugins/tools/bin/check.sh': 'exit 0\n',
  'plugins/tools/LICENSE': 'MIT\n',
};

describe('the discovery page', () => {
  it('keeps the items, when each source was fetched and the source as an object to pass back', async () => {
    await fixture.commit(MARKETPLACE);

    const page = await rig.service.discovery.browse({ source: here() });
    const again = await rig.service.discovery.browse({
      source: page.sources[0]?.source,
      snapshot: page.snapshot,
      page: 1,
    });

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.sources[0]).toMatchObject({ source: here(), snapshot: fixture.head() });
    expect(Date.parse(page.sources[0]?.fetched_at ?? '')).not.toBeNaN();
    expect(again.items).toEqual(page.items);
  });

  it('names plugins plugin and filters by kind, publisher and whether they are installed', async () => {
    await fixture.commit(MARKETPLACE);
    await installOne(rig, await referenceOf(rig, 'plugin:notes', here()));

    const plugins = await rig.service.discovery.browse({ source: here(), kind: 'plugin' });
    const mine = await rig.service.discovery.browse({ source: here(), installed: true });
    const other = await rig.service.discovery.browse({ source: here(), publisher: 'Someone' });
    const byPublisher = await rig.service.discovery.browse({
      source: here(),
      query: 'fixture inc',
    });
    const fixtureInc = await rig.service.discovery.browse({
      source: here(),
      publisher: 'fixture inc',
    });

    expect(plugins.items.map((item) => [item.kind, item.name])).toEqual([
      ['plugin', 'tools'],
      ['plugin', 'notes'],
    ]);
    expect(mine.items.map((item) => item.id)).toEqual(['plugin:notes']);
    expect(other.total).toBe(0);
    expect(byPublisher.items.map((item) => item.id)).toEqual(plugins.items.map((item) => item.id));
    expect(fixtureInc.total).toBe(plugins.total);
  });

  it('puts an exact name first, then names that contain the text, then descriptions', async () => {
    await fixture.commit({
      'skills/pdf-tools/SKILL.md': SKILL('pdf-tools', 'Tools.'),
      'skills/reader/SKILL.md':
        '---\nname: reader\ndescription: Reads a pdf aloud.\n---\n\nRead.\n',
      'skills/pdf/SKILL.md': SKILL('pdf', 'PDF.'),
      'skills/other/SKILL.md': SKILL('other', 'Other.'),
    });

    const page = await rig.service.discovery.browse({ source: here(), query: 'PDF' });

    expect(page.items.map((item) => item.name)).toEqual(['pdf', 'pdf-tools', 'reader']);
  });

  it('refuses a later page with a typed reason when the source moved under it', async () => {
    await fixture.commit({ 'skills/a/SKILL.md': SKILL('a', 'A.') });
    const first = await rig.service.discovery.browse({ source: here(), page_size: 1 });
    await fixture.change({ 'skills/b/SKILL.md': SKILL('b', 'B.') });

    await expect(
      rig.service.discovery.browse({
        source: here(),
        page: 2,
        snapshot: first.snapshot,
        refresh: true,
      }),
    ).rejects.toMatchObject({ code: 'conflict', reason: 'snapshot_moved' });
  });

  it('shows the installed and the available version and whether an update is waiting', async () => {
    await fixture.commit({ 'skills/a/SKILL.md': SKILL('a', 'One.') });
    const before = await rig.service.discovery.browse({ source: here() });
    const item = await installOne(rig, await referenceOf(rig, 'skill:a', here()));
    const current = await rig.service.discovery.browse({ source: here() });
    await fixture.change({ 'skills/a/SKILL.md': SKILL('a', 'Two.') });
    const moved = await rig.service.discovery.browse({ source: here(), refresh: true });

    expect(before.items[0]).toMatchObject({ update: 'not_installed', installed_version: null });
    expect(current.items[0]).toMatchObject({
      update: 'current',
      installed_id: 'skill:a',
      installed_version: item.version,
      available_version: item.version,
    });
    expect(moved.items[0]?.update).toBe('update_available');
  });
});

describe('the layout of a repository', () => {
  it('keeps git marketplace entries when a command-based entry is present', async () => {
    await fixture.commit({
      '.claude-plugin/marketplace.json': JSON.stringify({
        name: 'mixed-market',
        plugins: [
          {
            name: 'local-command',
            source: { source: 'command', command: 'must-never-run', mode: 'link' },
          },
          {
            name: 'git-extension',
            source: {
              source: 'git-subdir',
              url: 'https://example.test/git',
              path: 'plugins/git',
              ref: 'main',
              sha: 'c'.repeat(40),
            },
          },
        ],
      }),
    });

    const page = await rig.service.discovery.browse({ source: here(), kind: 'plugin' });
    const resolution = await rig.service.extensions.resolve(here());

    expect(page.items.map((item) => item.id)).toEqual(['plugin:git-extension']);
    expect(resolution.candidates[0]?.source).toEqual({
      url: 'https://example.test/git',
      path: 'plugins/git',
      ref: 'c'.repeat(40),
    });
  });

  it('finds nested monorepo skills and plugins from the repository file listing, at any depth', async () => {
    await fixture.commit({
      'packages/editor/agents/skills/deep/SKILL.md': SKILL('deep', 'Deep.'),
      'packages/editor/agents/skills/deep/examples/inner/SKILL.md': SKILL('inner', 'Inner.'),
      'tools/a/b/c/kit/.claude-plugin/plugin.json': JSON.stringify({ name: 'kit' }),
      'tools/a/b/c/kit/skills/own/SKILL.md': SKILL('own', 'Belongs to the kit.'),
      'README.md': 'Monorepo.\n',
    });

    const page = await rig.service.discovery.browse({ source: here() });

    expect(page.items.map((item) => item.id)).toEqual(['skill:deep', 'plugin:kit']);
  });

  it('takes a folder with only a .mcp.json as a plugin that runs an MCP server', async () => {
    await fixture.commit({
      '.mcp.json': JSON.stringify({ mcpServers: { db: { command: 'db-mcp' } } }),
    });

    const page = await rig.service.discovery.browse({ source: here() });

    expect(page.items).toEqual([expect.objectContaining({ kind: 'plugin', executes: true })]);
  });

  it('says which formats it does not read yet', async () => {
    await fixture.commit({ 'AGENTS.md': 'Rules.\n', '.cursor/rules/style.mdc': 'Style.\n' });

    await expect(rig.service.discovery.browse({ source: here() })).rejects.toThrow(
      /AGENTS\.md or \.cursor\/rules are not supported/u,
    );
  });
});

describe('previewing before an install', () => {
  it('shows the manifest, files, license, hooks, MCP servers and scripts and writes nothing', async () => {
    await fixture.commit(TOOLS_WITH_SERVERS);
    const reference = await referenceOf(rig, 'plugin:tools', here());

    const { results } = await rig.service.extensions.preview({ items: [reference] });

    expect(results[0]).toMatchObject({
      ok: true,
      preview: {
        id: 'plugin:tools',
        commit: fixture.head(),
        manifest: { name: 'tools' },
        hooks: [
          { event: 'PreToolUse', matcher: 'Bash', type: 'command', command: './bin/check.sh' },
        ],
        mcp_servers: [
          { name: 'search', transport: 'stdio', command: 'node', env: ['SEARCH_TOKEN'] },
          {
            name: 'remote',
            transport: 'http',
            url: 'https://mcp.example.test',
            headers: ['Authorization'],
          },
        ],
        scripts: ['bin/check.sh'],
        executes: true,
      },
    });
    const preview = results[0]?.ok === true ? results[0].preview : undefined;
    expect(preview?.files.map((file) => file.path)).toContain('LICENSE');
    expect(rig.service.extensions.installed().size).toBe(0);
  });
});

describe('installing discovered items', () => {
  it('uses the exact folder for a shared name and protects the existing installation', async () => {
    await fixture.commit({
      'first/pdf/SKILL.md': SKILL('pdf', 'First provider.'),
      'second/pdf/SKILL.md': SKILL('pdf', 'Second provider.'),
    });
    const {
      items: [first, second],
    } = await rig.service.discovery.browse({ source: here(), query: 'pdf' });
    if (first === undefined || second === undefined) throw new Error('Expected two PDF offers');

    const installed = await installOne(rig, first.reference);
    const mine = await rig.service.discovery.browse({ source: here(), installed: true });
    const other = await rig.service.discovery.browse({ source: here(), installed: false });
    const attempt = await rig.service.extensions.install({ items: [second.reference] });

    expect(mine.items).toEqual([
      expect.objectContaining({ installed_id: 'skill:pdf', reference: first.reference }),
    ]);
    expect(other.items).toEqual([
      expect.objectContaining({
        installed_id: null,
        installed_version: null,
        reference: second.reference,
      }),
    ]);
    expect(attempt.results[0]).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(
      rig.service.extensions.catalogue().items.find((item) => item.id === installed.id),
    ).toEqual(installed);
  });

  it('installs the commit that discovery showed, not a newer one', async () => {
    await fixture.commit({ 'skills/a/SKILL.md': SKILL('a', 'Shown.') });
    const reference = await referenceOf(rig, 'skill:a', here());
    await fixture.change({ 'skills/a/SKILL.md': SKILL('a', 'Newer.') });

    const item = await installOne(rig, reference);

    const tree = await rig.service.extensions.tree('skill', 'skill:a', item.version ?? '');
    expect(Buffer.from(tree.files[0]?.base64 ?? '', 'base64').toString()).toContain('Shown.');
    expect(item.source).toMatchObject({ kind: 'git', commit: reference.snapshot, ref: null });
  });

  it('reports each item of a batch, so one failure does not hide the others', async () => {
    await fixture.commit(MARKETPLACE);
    const notes = await referenceOf(rig, 'plugin:notes', here());
    const tools = await referenceOf(rig, 'plugin:tools', here());

    const { results } = await rig.service.extensions.install({
      items: [notes, { ...notes, id: 'plugin:missing' }, tools],
    });

    expect(results.map((result) => [result.reference.id, result.ok])).toEqual([
      ['plugin:notes', true],
      ['plugin:missing', false],
      ['plugin:tools', false],
    ]);
    expect(results[1]).toMatchObject({ error: { code: 'not_found' } });
    expect(results[2]?.ok === false ? results[2].error.message : '').toMatch(/Confirm/u);
    expect([...rig.service.extensions.installed().keys()]).toEqual(['plugin:notes']);
  });
});

describe('the known sources', () => {
  it('starts with the seeded sources and searches the ones the owner keeps', async () => {
    await fixture.commit({ 'skills/a/SKILL.md': SKILL('a', 'A.') });
    const seeded = rig.service.sources.list().sources;

    for (const entry of seeded) rig.service.sources.remove(entry.id);
    const added = rig.service.sources.add({ source: here(), label: 'Team skills' });
    const page = await rig.service.discovery.browse({});

    expect(seeded.map((entry) => entry.source.url)).toEqual([
      'anthropics/skills',
      'anthropics/claude-plugins-official',
    ]);
    expect(added.sources).toEqual([
      expect.objectContaining({ label: 'Team skills', source: here() }),
    ]);
    expect(page.items.map((item) => item.id)).toEqual(['skill:a']);
    expect(rig.service.sources.list()).toEqual(added);
  });

  it('reports a broken known source alongside matches from healthy sources', async () => {
    await fixture.commit({ 'skills/a/SKILL.md': SKILL('a', 'A.') });
    const unavailable = { url: join(fixture.repository, 'missing') };
    for (const entry of rig.service.sources.list().sources) rig.service.sources.remove(entry.id);
    rig.service.sources.add({ source: unavailable });
    rig.service.sources.add({ source: here() });

    const page = await rig.service.discovery.browse({ kind: 'skill' });

    expect(page.items.map((item) => item.id)).toEqual(['skill:a']);
    expect(page.unavailable_sources).toEqual([unavailable]);
    await expect(rig.service.discovery.browse({ source: unavailable })).rejects.toMatchObject({
      code: 'upstream_failed',
    });
  });

  it('refuses to remove a source it does not know', () => {
    expect(() => rig.service.sources.remove('missing')).toThrow(/no known source/u);
  });
});
