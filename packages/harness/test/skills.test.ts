import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HarnessExtensionTree } from '@smarteverything/domain';
import type { HarnessHost } from '../src/host/contracts';
import { HarnessSkillAssets, type HarnessSkillAssetSource } from '../src/composition/skill-assets';
import {
  desiredHarnessConfiguration,
  installedHarnessBuiltins,
  HARNESS_SKILLS_PACKAGE,
} from '../src';
import { PRODUCT_SKILLS } from '../src/composition/product-skill-catalogue';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';
import {
  builtinEntry,
  extensionSource,
  skillFixture,
  type ExtensionFixture,
} from './support/plugin-assets';

let fixture: RuntimeFixture | undefined;
let cache: string | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
  if (cache !== undefined) await rm(cache, { recursive: true, force: true });
  cache = undefined;
});

const AUTHORITY = { kind: 'manual', profileId: randomUUID() } as const;

async function deviceWithSkills(): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    desiredConfiguration: {
      revision: 'skills-only',
      entries: desiredHarnessConfiguration().entries.filter(
        (entry) => entry.package === HARNESS_SKILLS_PACKAGE,
      ),
    },
    installedPlugins: (host) =>
      installedHarnessBuiltins(host).filter((plugin) => plugin.package === HARNESS_SKILLS_PACKAGE),
  });
  return fixture;
}

async function writeWorkspaceSkill(
  workspace: string,
  name: string,
  body: string,
  options: { readonly root?: string; readonly frontmatter?: string } = {},
): Promise<void> {
  const directory = join(workspace, options.root ?? '.agents/skills', name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Keeps notes for ${name}.\n${options.frontmatter ?? ''}---\n\n${body}\n`,
  );
}

async function hubWithSkills(
  config: Readonly<Record<string, number>> = {},
): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    target: { kind: 'server' },
    desiredConfiguration: {
      revision: 'skills-only',
      entries: desiredHarnessConfiguration()
        .entries.filter((entry) => entry.package === HARNESS_SKILLS_PACKAGE)
        .map((entry) => ({ ...entry, config: { ...entry.config, ...config } })),
    },
    installedPlugins: (host) =>
      installedHarnessBuiltins(host).filter((plugin) => plugin.package === HARNESS_SKILLS_PACKAGE),
  });
  return fixture;
}

function catalogue(host: RuntimeFixture): string {
  return spoken(host.model.requests[0]?.messages ?? [])
    .map((message) => message.text)
    .filter((text) => text.includes('<available_skills>'))
    .join('\n');
}

function toolResult(host: RuntimeFixture): string {
  const message = host.model.requests[1]?.messages.at(-1);
  return spoken(message === undefined ? [] : [message])[0]?.text ?? '';
}

describe('product skills on a hub conversation', () => {
  it('lists every SmartEverything product skill in the skill catalogue', async () => {
    fixture = await bootRuntime({ target: { kind: 'server' } });
    fixture.model.script({ kind: 'text', text: 'hi' });
    const session = await fixture.runtime.create({
      ...fixture.sessionOptions(),
      authority: AUTHORITY,
    });

    session.text('hello');
    await turnsFinished(fixture, session, 1);

    const listed = catalogue(fixture);
    expect(PRODUCT_SKILLS.skills.length).toBeGreaterThan(5);
    for (const skill of PRODUCT_SKILLS.skills) expect(listed).toContain(`\`${skill.name}\``);
  });

  it('loads the full instructions of a product skill through the skill tool', async () => {
    fixture = await bootRuntime({ target: { kind: 'server' } });
    fixture.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'smarteverything-home' } },
      { kind: 'text', text: 'loaded' },
    );
    const session = await fixture.runtime.create({
      ...fixture.sessionOptions(),
      authority: AUTHORITY,
    });

    session.text('help with my devices');
    await turnsFinished(fixture, session, 1);

    expect(toolResult(fixture)).toContain('# Home and devices');
    expect(toolResult(fixture)).toContain('<skill_content name="smarteverything-home">');
  });
});

describe('workspace skills on a machine', () => {
  it('lists a skill from the workspace and the product skills together', async () => {
    const host = await deviceWithSkills();
    await writeWorkspaceSkill(host.workspace, 'note-taker', 'Write every note as one bullet.');
    host.model.script({ kind: 'text', text: 'hi' });
    const session = await host.runtime.create(host.sessionOptions());

    session.text('hello');
    await turnsFinished(host, session, 1);

    const listed = catalogue(host);
    expect(listed).toContain('`note-taker`: Keeps notes for note-taker.');
    expect(listed).toContain('`smarteverything-home`');
  });

  it('loads a workspace skill by name with its instructions', async () => {
    const host = await deviceWithSkills();
    await writeWorkspaceSkill(host.workspace, 'note-taker', 'Write every note as one bullet.');
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'note-taker' } },
      { kind: 'text', text: 'loaded' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('take a note');
    await turnsFinished(host, session, 1);

    expect(toolResult(host)).toContain('Write every note as one bullet.');
  });

  it('tells the model when a skill does not exist instead of inventing one', async () => {
    const host = await deviceWithSkills();
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'no-such-skill' } },
      { kind: 'text', text: 'none' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('use a skill');
    await turnsFinished(host, session, 1);

    expect(toolResult(host)).toBe('Error: skill "no-such-skill" is unknown or no longer available');
  });
});

describe('Claude-format skills', () => {
  const CLAUDE_FRONTMATTER =
    'allowed-tools: Read, Grep\ncontext: fork\nagent: Explore\nhooks:\n  PreToolUse: []\npermissionMode: plan\n';

  it('loads a skill that declares allowed-tools, context, agent, hooks and permissionMode', async () => {
    const host = await deviceWithSkills();
    await writeWorkspaceSkill(host.workspace, 'claude-style', 'Use the Claude format as written.', {
      frontmatter: CLAUDE_FRONTMATTER,
    });
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'claude-style' } },
      { kind: 'text', text: 'loaded' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('use it');
    await turnsFinished(host, session, 1);

    expect(catalogue(host)).toContain('`claude-style`');
    expect(toolResult(host)).toContain('Use the Claude format as written.');
  });

  it('reads skills from .claude/skills in the working folder on a machine', async () => {
    const host = await deviceWithSkills();
    await writeWorkspaceSkill(host.workspace, 'claude-folder', 'Read from the Claude folder.', {
      root: '.claude/skills',
    });
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'claude-folder' } },
      { kind: 'text', text: 'loaded' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('use it');
    await turnsFinished(host, session, 1);

    expect(toolResult(host)).toContain('Read from the Claude folder.');
  });

  it('gives a hub conversation the folder skills next to the product skills', async () => {
    const host = await hubWithSkills();
    await writeWorkspaceSkill(host.workspace, 'agents-folder', 'From the agents folder.');
    await writeWorkspaceSkill(host.workspace, 'claude-folder', 'From the Claude folder.', {
      root: '.claude/skills',
      frontmatter: CLAUDE_FRONTMATTER,
    });
    host.model.script({ kind: 'text', text: 'hi' });
    const session = await host.runtime.create({
      ...host.sessionOptions(),
      authority: AUTHORITY,
    });

    session.text('hello');
    await turnsFinished(host, session, 1);

    const listed = catalogue(host);
    expect(listed).toContain('`agents-folder`');
    expect(listed).toContain('`claude-folder`');
    expect(listed).toContain('`smarteverything-home`');
  });
});

describe('the skill catalogue length', () => {
  it('applies the configured description length on a hub conversation', async () => {
    const host = await hubWithSkills({ catalog_description_max_length: 12 });
    await writeWorkspaceSkill(host.workspace, 'note-taker', 'Notes.');
    host.model.script({ kind: 'text', text: 'hi' });
    const session = await host.runtime.create({
      ...host.sessionOptions(),
      authority: AUTHORITY,
    });

    session.text('hello');
    await turnsFinished(host, session, 1);

    const listed = catalogue(host);
    expect(listed).toContain('`note-taker`');
    expect(listed).not.toContain('Keeps notes for note-taker.');
  });
});

describe('a skill installed on the Home Hub', () => {
  async function withSharedSkill(
    shared: ExtensionFixture,
    target?: HarnessHost['target'],
  ): Promise<RuntimeFixture> {
    cache = await mkdtemp(join(tmpdir(), 'skill-cache-'));
    const assets = new HarnessSkillAssets(cache, extensionSource([shared]));
    fixture = await bootRuntime({
      ...(target === undefined ? {} : { target }),
      desiredConfiguration: {
        revision: 'shared-skill',
        entries: [builtinEntry('skills', [shared])],
      },
      installedPlugins: (host) =>
        installedHarnessBuiltins(host, assets).filter(
          (plugin) => plugin.package === HARNESS_SKILLS_PACKAGE,
        ),
    });
    return fixture;
  }

  it('loads although it declares allowed-tools, context and hooks', async () => {
    const host = await withSharedSkill(
      skillFixture(
        'shared-note',
        '---\nname: shared-note\ndescription: Shared notes.\nallowed-tools: Read\ncontext: fork\nhooks:\n  Stop: []\n---\n\nKeep shared notes short.\n',
      ),
    );
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'shared-note' } },
      { kind: 'text', text: 'loaded' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('use it');
    await turnsFinished(host, session, 1);

    expect(toolResult(host)).toContain('Keep shared notes short.');
  });

  it('is available on the Home Hub itself, not only on other machines', async () => {
    const host = await withSharedSkill(
      skillFixture(
        'hub-note',
        '---\nname: hub-note\ndescription: Hub notes.\n---\n\nKeep hub notes short.\n',
      ),
      { kind: 'server' },
    );
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'hub-note' } },
      { kind: 'text', text: 'loaded' },
    );
    const session = await host.runtime.create({ ...host.sessionOptions(), authority: AUTHORITY });

    session.text('use it');
    await turnsFinished(host, session, 1);

    expect(toolResult(host)).toContain('Keep hub notes short.');
  });

  it('is fetched once into a cache named by its content and reused', async () => {
    const shared = skillFixture(
      'cached-note',
      '---\nname: cached-note\ndescription: Cached notes.\n---\n\nCached.\n',
    );
    let reads = 0;
    const counting = {
      read: (
        ...args: Parameters<HarnessSkillAssetSource['read']>
      ): Promise<HarnessExtensionTree> => {
        reads += 1;
        return extensionSource([shared]).read(...args);
      },
    };
    cache = await mkdtemp(join(tmpdir(), 'skill-cache-'));
    const assets = new HarnessSkillAssets(cache, counting);

    await assets.acquireAll('skill', [shared.asset]);
    const [again] = await assets.acquireAll('skill', [shared.asset]);

    expect(reads).toBe(1);
    expect(again?.directory).toBe(join(cache, shared.asset.version));
    expect(await readFile(join(cache, shared.asset.version, 'SKILL.md'), 'utf8')).toContain(
      'Cached.',
    );
  });

  it('is refused when the Home Hub sends different files than the version it announced', async () => {
    const announced = skillFixture(
      'moved-note',
      '---\nname: moved-note\ndescription: Notes.\n---\n\nOne.\n',
    );
    const other = skillFixture(
      'moved-note',
      '---\nname: moved-note\ndescription: Notes.\n---\n\nTwo.\n',
    );
    cache = await mkdtemp(join(tmpdir(), 'skill-cache-'));
    const assets = new HarnessSkillAssets(
      cache,
      extensionSource([{ ...other, asset: announced.asset }]),
    );

    await expect(assets.acquireAll('skill', [announced.asset])).rejects.toThrow(
      /changed on the Home Hub/u,
    );
  });

  it('removes cached versions nobody has used for a week and keeps the live one', async () => {
    const shared = skillFixture(
      'live-note',
      '---\nname: live-note\ndescription: Notes.\n---\n\nLive.\n',
    );
    cache = await mkdtemp(join(tmpdir(), 'skill-cache-'));
    const stale = join(cache, 'stale-version');
    await mkdir(stale);
    const longAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(stale, longAgo, longAgo);
    const assets = new HarnessSkillAssets(cache, extensionSource([shared]));

    await assets.acquireAll('skill', [shared.asset]);

    expect(await readdir(cache)).toEqual([shared.asset.version]);
  });
});
