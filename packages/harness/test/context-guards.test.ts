import { afterEach, describe, expect, it } from 'vitest';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { PLUGINS } from '../src/plugins';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

const REPEAT_REMINDER = 'You are repeating the exact same tool call with identical arguments';
const SLOW_TIMEOUT_MS = 20;

function register(ctx: Context): void {
  ctx.tools.register({
    name: 'probe',
    description: 'Return a fixed answer.',
    parameters: {
      type: 'object',
      properties: { topic: { type: 'string' } },
      required: ['topic'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: () => Promise.resolve({ answer: 'fixed' }),
  });
  ctx.tools.register({
    name: 'slow',
    description: 'Wait until cancelled.',
    timeoutMs: SLOW_TIMEOUT_MS,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (_raw, execution) =>
      new Promise((_resolve, reject) => {
        execution.signal.addEventListener('abort', () => {
          reject(new Error('stopped'));
        });
      }),
  });
}

async function boot(): Promise<RuntimeFixture> {
  fixture = await bootRuntime({ mount: register });
  return fixture;
}

function requestText(host: RuntimeFixture, index: number): string {
  return JSON.stringify(host.model.requests[index]?.messages ?? []);
}

function lastResult(host: RuntimeFixture, index: number): string {
  const message = host.model.requests[index]?.messages.at(-1);
  return spoken(message === undefined ? [] : [message])[0]?.text ?? '';
}

describe('the plugin list', () => {
  it('names every plugin once', () => {
    const names = PLUGINS.map((plugin) => plugin.name);

    expect(names).toContain('context-guards');
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the repeat-call reminder', () => {
  it('nudges the model on the third identical call and not before', async () => {
    const host = await boot();
    const call = { kind: 'tool', name: 'probe', input: { topic: 'same' } } as const;
    host.model.script(
      { ...call, id: 'c1' },
      { ...call, id: 'c2' },
      { ...call, id: 'c3' },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('look it up');
    await turnsFinished(host, session, 1);

    expect(requestText(host, 2)).not.toContain(REPEAT_REMINDER);
    expect(requestText(host, 3)).toContain(REPEAT_REMINDER);
  });

  it('stays silent when the arguments differ', async () => {
    const host = await boot();
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'probe', input: { topic: 'a' } },
      { kind: 'tool', id: 'c2', name: 'probe', input: { topic: 'b' } },
      { kind: 'tool', id: 'c3', name: 'probe', input: { topic: 'c' } },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('look it up');
    await turnsFinished(host, session, 1);

    expect(requestText(host, 3)).not.toContain(REPEAT_REMINDER);
  });
});

describe('the tool-call timeout policy', () => {
  it('answers a tool that declares a limit with a timeout error once it is cancelled', async () => {
    const host = await boot();
    host.model.script(
      { kind: 'tool', id: 's1', name: 'slow', input: {} },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('wait');
    await turnsFinished(host, session, 1);

    expect(lastResult(host, 1)).toBe(
      `Error: tool call timed out after ${String(SLOW_TIMEOUT_MS)}ms`,
    );
  });
});

describe('the local spill store', () => {
  it('keeps the complete grep result when it is capped', async () => {
    const host = await boot();
    const lines = Array.from({ length: 400 }, (_, index) => `needle ${String(index)}`);
    await writeFile(join(host.workspace, 'hits.txt'), `${lines.join('\n')}\n`);
    host.model.script(
      { kind: 'tool', id: 'g1', name: 'grep', input: { pattern: 'needle' } },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create(host.sessionOptions());

    session.text('find it');
    await turnsFinished(host, session, 1);

    const result = lastResult(host, 1);
    const stored = /Full grep result stored at: (\S+?)\.\s/u.exec(result)?.[1];
    expect(result).not.toContain('could not be saved');
    if (stored === undefined) throw new Error('The capped result carries no spill locator.');
    const saved = await readFile(stored, 'utf8');
    await rm(dirname(dirname(stored)), { recursive: true, force: true });
    expect(saved).toContain('needle 0');
    expect(saved).toContain('needle 399');
  });
});

describe('the compact and help commands', () => {
  it('lists /compact from the harness and /help once each', async () => {
    const host = await boot();
    const session = await host.runtime.create(host.sessionOptions());
    const commands = session.commands();

    expect(commands.filter((command) => command.name === 'compact')).toHaveLength(1);
    expect(commands.filter((command) => command.name === 'help')).toHaveLength(1);
    expect(commands.find((command) => command.name === 'compact')?.description).toBe(
      'Compact older conversation history',
    );
  });

  it('reports an empty history and rejects input', async () => {
    const host = await boot();
    const session = await host.runtime.create(host.sessionOptions());

    const empty = await session.command('/compact', []);
    const typed = await session.command('/compact now', []);

    expect(empty?.result).toMatchObject({ kind: 'success', text: 'No compactable history yet.' });
    expect(typed?.result).toMatchObject({ kind: 'error', text: 'Usage: /compact (no arguments)' });
  });

  it('lets /help describe /compact', async () => {
    const host = await boot();
    const session = await host.runtime.create(host.sessionOptions());

    const help = await session.command('/help', []);

    expect(help?.result.kind).toBe('success');
    expect(JSON.stringify(help?.result)).toContain('/compact');
  });
});
