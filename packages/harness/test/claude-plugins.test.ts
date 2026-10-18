import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  desiredHarnessConfiguration,
  HARNESS_SKILLS_PACKAGE,
  installedHarnessBuiltins,
} from '../src';
import { HARNESS_CLAUDE_PLUGINS_PACKAGE } from '../src/composition/claude-plugin-metadata';
import { HarnessSkillAssets } from '../src/composition/skill-assets';
import type { HarnessDesiredEntry } from '../src/composition/configuration';
import type { PluginAgentPort } from '../src/composition/plugin-agent-port';
import { readHarnessPluginAgent } from '../src/composition/plugin-agent-source';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';
import { builtinEntry, extensionSource, pluginFixture } from './support/plugin-assets';
import type { ExtensionFixture } from './support/plugin-assets';

let fixture: RuntimeFixture | undefined;
let cache: string | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
  if (cache !== undefined) await rm(cache, { recursive: true, force: true });
  cache = undefined;
});

function skillsEntry(): HarnessDesiredEntry {
  const entry = desiredHarnessConfiguration().entries.find(
    (candidate) => candidate.package === HARNESS_SKILLS_PACKAGE,
  );
  if (entry === undefined) throw new Error('The default configuration has no skills entry.');
  return entry;
}

const FEATURE_DEV = pluginFixture('feature-dev', {
  'commands/feature-dev.md':
    '---\ndescription: Guided feature development\nargument-hint: feature\n---\n\nPlan and build this feature step by step: $ARGUMENTS\n',
});

async function withPlugins(
  fixtures: readonly ExtensionFixture[],
  port?: PluginAgentPort,
): Promise<RuntimeFixture> {
  cache = await mkdtemp(join(tmpdir(), 'plugin-cache-'));
  const assets = new HarnessSkillAssets(cache, extensionSource(fixtures));
  fixture = await bootRuntime({
    desiredConfiguration: {
      revision: 'plugins',
      entries: [skillsEntry(), builtinEntry('claude-plugins', fixtures)],
    },
    installedPlugins: (host) =>
      installedHarnessBuiltins(host, assets, port).filter(
        (plugin) =>
          plugin.package === HARNESS_SKILLS_PACKAGE ||
          plugin.package === HARNESS_CLAUDE_PLUGINS_PACKAGE,
      ),
  });
  return fixture;
}

const CODE_SIMPLIFIER = pluginFixture('code-simplifier', {
  'agents/code-simplifier.md':
    '---\nname: code-simplifier\ndescription: Simplifies recently changed code\n---\n\nYou simplify code without changing behaviour.\n',
});

const FRONTEND_DESIGN = pluginFixture('frontend-design', {
  'skills/frontend-design/SKILL.md':
    '---\nname: frontend-design\ndescription: Design distinctive interfaces\n---\n\nPick one bold visual direction before writing markup.\n',
});

function toolNames(host: RuntimeFixture): readonly string[] {
  return host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
}

describe('a plugin command', () => {
  it('is listed with the built-in commands', async () => {
    const host = await withPlugins([FEATURE_DEV]);
    const session = await host.runtime.create(host.sessionOptions());

    expect(session.commands().map((command) => command.name)).toStrictEqual(
      expect.arrayContaining(['feature-dev', 'compact', 'help']),
    );
  });

  it('turns into a prompt carrying the typed arguments', async () => {
    const host = await withPlugins([FEATURE_DEV]);
    host.model.script({ kind: 'text', text: 'On it' });
    const session = await host.runtime.create(host.sessionOptions());

    const executed = await session.command('/feature-dev a login page', []);
    await turnsFinished(host, session, 1);

    expect(executed?.result.kind).toBe('success');
    expect(spoken(host.model.requests[0]?.messages ?? []).map((m) => m.text)).toContain(
      'Plan and build this feature step by step: a login page',
    );
  });
});

describe('a plugin skill', () => {
  it('appears in the skill catalogue and loads on request', async () => {
    const host = await withPlugins([FRONTEND_DESIGN]);
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'frontend-design' } },
      { kind: 'text', text: 'loaded' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('design a landing page');
    await turnsFinished(host, session, 1);

    const catalogue = spoken(host.model.requests[0]?.messages ?? [])
      .map((m) => m.text)
      .join('\n');
    expect(catalogue).toContain('`frontend-design`: Design distinctive interfaces');
    const loaded = host.model.requests[1]?.messages.at(-1);
    expect(spoken(loaded === undefined ? [] : [loaded])[0]?.text).toContain(
      'Pick one bold visual direction before writing markup.',
    );
  });
});

describe('a plugin agent', () => {
  it('is offered to the model as a helper tool', async () => {
    const host = await withPlugins([CODE_SIMPLIFIER]);
    host.model.script({ kind: 'text', text: 'ok' });
    const session = await host.runtime.create(host.sessionOptions());

    session.text('hello');
    await turnsFinished(host, session, 1);

    expect(toolNames(host)).toContain('subagent_code-simplifier');
  });

  it('hands the task to the durable helper port with the helper name and prompt', async () => {
    const calls: { readonly helper: string; readonly raw: unknown }[] = [];
    const port: PluginAgentPort = {
      start: (_ctx, call) => {
        calls.push({ helper: call.helper, raw: call.raw });
        return Promise.reject(new Error('helper port reached'));
      },
    };
    const host = await withPlugins([CODE_SIMPLIFIER], port);
    host.model.script(
      {
        kind: 'tool',
        id: 'c1',
        name: 'subagent_code-simplifier',
        input: { prompt: 'Tidy src/index.ts' },
      },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('simplify my code');
    await turnsFinished(host, session, 1);

    expect(calls).toStrictEqual([
      { helper: 'code-simplifier', raw: { prompt: 'Tidy src/index.ts' } },
    ]);
    const result = host.model.requests[1]?.messages.at(-1);
    expect(spoken(result === undefined ? [] : [result])[0]?.text).toContain('helper port reached');
  });

  it('refuses to run a helper when the host has no durable helper port', async () => {
    const host = await withPlugins([CODE_SIMPLIFIER]);
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'subagent_code-simplifier', input: { prompt: 'Tidy it' } },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('simplify my code');
    await turnsFinished(host, session, 1);

    const result = host.model.requests[1]?.messages.at(-1);
    expect(spoken(result === undefined ? [] : [result])[0]?.text).toMatch(/^Error:/u);
  });
});

describe('Claude-format plugin files', () => {
  it('runs a command that declares allowed-tools', async () => {
    const restricted = pluginFixture('feature-dev', {
      'commands/feature-dev.md':
        '---\ndescription: Guided feature development\nallowed-tools: Read, Grep, Bash(git:*)\nmodel: sonnet\n---\n\nPlan this feature: $ARGUMENTS\n',
    });
    const host = await withPlugins([restricted]);
    host.model.script({ kind: 'text', text: 'On it' });
    const session = await host.runtime.create(host.sessionOptions());

    const executed = await session.command('/feature-dev a login page', []);
    await turnsFinished(host, session, 1);

    expect(executed?.result.kind).toBe('success');
    expect(spoken(host.model.requests[0]?.messages ?? []).map((m) => m.text)).toContain(
      'Plan this feature: a login page',
    );
  });

  it('loads a plugin skill that declares allowed-tools', async () => {
    const restricted = pluginFixture('frontend-design', {
      'skills/frontend-design/SKILL.md':
        '---\nname: frontend-design\ndescription: Design distinctive interfaces\nallowed-tools: Read, Write\n---\n\nPick one bold visual direction.\n',
    });
    const host = await withPlugins([restricted]);
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'frontend-design' } },
      { kind: 'text', text: 'loaded' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('design a landing page');
    await turnsFinished(host, session, 1);

    const loaded = host.model.requests[1]?.messages.at(-1);
    expect(spoken(loaded === undefined ? [] : [loaded])[0]?.text).toContain(
      'Pick one bold visual direction.',
    );
  });

  it('reads a plugin agent that declares tools, color and double-brace text', async () => {
    const fixtures = pluginFixture('code-simplifier', {
      'agents/code-simplifier.md':
        '---\nname: code-simplifier\ndescription: Simplifies code\ntools: Read, Edit, Grep\ncolor: blue\nmodel: opus\n---\n\nKeep templates like {{name}} unchanged.\n',
    });
    cache = await mkdtemp(join(tmpdir(), 'plugin-cache-'));
    const assets = new HarnessSkillAssets(cache, extensionSource([fixtures]));

    const [installed] = await assets.acquireAll('plugin', [fixtures.asset]);
    if (installed === undefined) throw new Error('The plugin was not fetched.');
    const helper = await readHarnessPluginAgent(installed, 'code-simplifier');

    expect(helper).toMatchObject({
      name: 'code-simplifier',
      description: 'Simplifies code',
      model: 'opus',
      body: 'Keep templates like {{name}} unchanged.',
    });
  });
});

describe('plugin hooks', () => {
  async function hookRan(executes: boolean): Promise<boolean> {
    const marker = join(await mkdtemp(join(tmpdir(), 'hook-marker-')), 'ran');
    const hooks = pluginFixture(
      'hooked',
      {
        'hooks/hooks.json': JSON.stringify({
          hooks: {
            UserPromptSubmit: [{ hooks: [{ type: 'command', command: `touch ${marker}` }] }],
          },
        }),
      },
      executes,
    );
    const host = await withPlugins([hooks]);
    host.model.script({ kind: 'text', text: 'ok' });
    const session = await host.runtime.create(host.sessionOptions());

    session.text('hello');
    await turnsFinished(host, session, 1);

    const ran = await stat(marker).then(
      () => true,
      () => false,
    );
    await rm(dirname(marker), { recursive: true, force: true });
    return ran;
  }

  it('run from a plugin the owner confirmed', async () => {
    expect(await hookRan(true)).toBe(true);
  });

  it('do not run from a plugin nobody confirmed', async () => {
    expect(await hookRan(false)).toBe(false);
  });
});
