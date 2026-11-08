import { afterEach, describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit';
import * as RepeatToolReminder from '@deepseek-ai/dsh-repeat-tool-reminder';
import * as ToolCallTimeoutPolicy from '@deepseek-ai/dsh-tool-call-timeout-policy';
import Commands from '@deepseek-ai/dsh-commands';
import TokenMeter from '@deepseek-ai/dsh-token-meter';
import * as CommandCompact from '@deepseek-ai/dsh-command-compact';
import { ConfiguredCompaction } from '../src/composition/compaction-policy';
import * as HumanCommands from '../src/composition/human-commands';
import { bootProviderLoop } from './support/loop-testkit';
import type { ProviderLoop } from './support/loop-testkit';
import { PLUGINS } from '../src/plugins';
import * as ContextGuards from '../src/plugins/context-guards';

let ctx: Context | undefined;
let loop: ProviderLoop | undefined;

afterEach(async () => {
  await ctx?.fiber.dispose();
  ctx = undefined;
  await loop?.dispose();
  loop = undefined;
});

async function bootCommands(): Promise<ProviderLoop> {
  const booted = await bootProviderLoop();
  loop = booted;
  await booted.ctx.plugin(Commands);
  await booted.ctx.plugin(TokenMeter);
  await booted.ctx.plugin(ConfiguredCompaction);
  await booted.ctx.plugin(CommandCompact);
  await booted.ctx.plugin(HumanCommands);
  return booted;
}

describe('the plugin list', () => {
  it('names every plugin once', () => {
    const names = PLUGINS.map((plugin) => plugin.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('lists the context guards', () => {
    expect(PLUGINS).toContain(ContextGuards);
    expect(ContextGuards.name).toBe('context-guards');
  });
});

describe('the context guards plugin', () => {
  it('mounts the repeat reminder, the tool timeout policy and the local spill store', async () => {
    const booted = new Context();
    ctx = booted;
    await mountAgentLoopTestDependencies(booted);
    await ContextGuards.mount(booted);

    expect(booted.spillStore).toBeDefined();
    const mounted = [...booted.registry.values()].map((entry) => entry.callback);
    expect(mounted).toContain(RepeatToolReminder.apply);
    expect(mounted).toContain(ToolCallTimeoutPolicy.apply);
  });
});

describe('the human commands', () => {
  it('serve /compact from the dsh compact command and keep /help', async () => {
    const booted = await bootCommands();
    const agent = await booted.agent('commands');
    const listed = booted.ctx.commands.list(agent);

    expect(listed.map((command) => command.name)).toStrictEqual(['compact', 'help']);
  });
});
