import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { HarnessAuthority } from '../src/host/server-policy';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const AUTHORITY: HarnessAuthority = { kind: 'manual', profileId: randomUUID() };

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function toolNames(host: RuntimeFixture): readonly string[] {
  return host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
}

function lastResult(host: RuntimeFixture, request = 1): string {
  const message = host.model.requests[request]?.messages.at(-1);
  return spoken(message === undefined ? [] : [message])[0]?.text ?? '';
}

async function device(): Promise<RuntimeFixture> {
  fixture = await bootRuntime();
  return fixture;
}

async function server(native: boolean): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    target: { kind: 'server' },
    serverToolAccess: { hubToolNames: () => [], nativeAccess: () => native, deny: () => undefined },
  });
  return fixture;
}

async function ask(host: RuntimeFixture, text: string, server = false): Promise<void> {
  const session = await host.runtime.create({
    ...host.sessionOptions(),
    ...(server ? { authority: AUTHORITY } : {}),
  });
  session.text(text);
  await turnsFinished(host, session, 1);
}

describe('Claude Code tool parity on a computer', () => {
  it('offers glob, grep, todo_write, exit_plan_mode and web_fetch', async () => {
    const host = await device();
    host.model.script({ kind: 'text', text: 'hi' });
    await ask(host, 'hello');

    expect(toolNames(host)).toStrictEqual(
      expect.arrayContaining(['glob', 'grep', 'todo_write', 'exit_plan_mode', 'web_fetch']),
    );
    expect(toolNames(host)).not.toContain('web_search');
  });

  it('finds files by pattern and by content in the working directory', async () => {
    const host = await device();
    await mkdir(join(host.workspace, 'src'));
    await writeFile(join(host.workspace, 'src', 'alpha.ts'), 'export const needle = 1;\n');
    await writeFile(join(host.workspace, 'notes.md'), 'nothing here\n');
    host.model.script(
      { kind: 'tool', id: 'g1', name: 'glob', input: { pattern: '*.ts' } },
      { kind: 'tool', id: 'g2', name: 'grep', input: { pattern: 'needle' } },
      { kind: 'text', text: 'done' },
    );
    await ask(host, 'find it');

    expect(lastResult(host, 1)).toContain('alpha.ts');
    expect(lastResult(host, 2)).toContain('alpha.ts');
    expect(lastResult(host, 2)).toContain('needle');
  });

  it('keeps a todo list the model rewrites as it works', async () => {
    const host = await device();
    host.model.script(
      {
        kind: 'tool',
        id: 't1',
        name: 'todo_write',
        input: {
          todos: [
            { content: 'Read the code', status: 'completed' },
            { content: 'Fix the bug', status: 'in_progress' },
            { content: 'Run the tests', status: 'pending' },
          ],
        },
      },
      { kind: 'text', text: 'planned' },
    );
    await ask(host, 'plan the work');

    expect(lastResult(host)).toMatch(/1 pending, 1 in progress, 1 completed/u);
  });

  it.each(['AGENTS.md', 'CLAUDE.md'])(
    'reads %s from the working directory into the conversation',
    async (name) => {
      const host = await device();
      await writeFile(join(host.workspace, name), 'Always answer in haiku.\n');
      host.model.script({ kind: 'text', text: 'ok' });
      await ask(host, 'hello');

      const text = spoken(host.model.requests[0]?.messages ?? [])
        .map((message) => message.text)
        .join('\n');
      expect(text).toContain('Always answer in haiku.');
    },
  );

  it('refuses web_fetch for a private address', async () => {
    const host = await device();
    host.model.script(
      { kind: 'tool', id: 'w1', name: 'web_fetch', input: { url: 'http://127.0.0.1:9/' } },
      { kind: 'text', text: 'refused' },
    );
    await ask(host, 'open it');

    expect(lastResult(host)).toMatch(/^Error:/u);
  });

  it('lists the /plan command next to the built-in ones', async () => {
    const host = await device();
    const session = await host.runtime.create(host.sessionOptions());

    expect(session.commands().map((command) => command.name)).toStrictEqual(
      expect.arrayContaining(['plan', 'compact', 'help']),
    );
  });
});

describe('plan mode', () => {
  it('adds the planning guidance once /plan is entered and drops it on /plan off', async () => {
    const host = await device();
    host.model.script({ kind: 'text', text: 'one' }, { kind: 'text', text: 'two' });
    const session = await host.runtime.create(host.sessionOptions());

    await session.command('/plan', []);
    session.text('design it');
    await turnsFinished(host, session, 1);
    await session.command('/plan off', []);
    session.text('now build it');
    await turnsFinished(host, session, 2);

    const planning = JSON.stringify(host.model.requests[0]);
    const building = JSON.stringify(host.model.requests[1]);
    expect(planning).toContain('exit_plan_mode and wait for the user to approve');
    expect(building).not.toContain('exit_plan_mode and wait for the user to approve');
  });
});

describe('exit_plan_mode', () => {
  async function planned(answer: { selected: string[]; custom?: string }): Promise<RuntimeFixture> {
    const asked: unknown[] = [];
    fixture = await bootRuntime({
      interactions: {
        approve: () => Promise.resolve('allowed-once'),
        question: (request) => {
          asked.push(request);
          return Promise.resolve({ answers: [{ id: 'plan-review', ...answer }] });
        },
      },
    });
    fixture.model.script(
      { kind: 'tool', id: 'p1', name: 'exit_plan_mode', input: { plan: '# Plan\n- one step' } },
      { kind: 'text', text: 'next' },
      { kind: 'text', text: 'after' },
    );
    const session = await fixture.runtime.create(fixture.sessionOptions());
    await session.command('/plan', []);
    session.text('design it');
    await turnsFinished(fixture, session, 1);
    session.text('go on');
    await turnsFinished(fixture, session, 2);
    expect(asked).toHaveLength(1);
    return fixture;
  }

  it('leaves plan mode once the person approves the plan', async () => {
    const host = await planned({ selected: ['Approve'] });

    expect(lastResult(host)).toContain('approved');
    expect(JSON.stringify(host.model.requests[2])).not.toContain('wait for the user to approve');
  });

  it('keeps planning with the feedback when the person is not satisfied', async () => {
    const host = await planned({ selected: [], custom: 'Add a rollback step.' });

    expect(lastResult(host)).toContain('Add a rollback step.');
    expect(JSON.stringify(host.model.requests[2])).toContain('wait for the user to approve');
  });
});

describe('Claude Code tool parity in a hub conversation', () => {
  it('gives every member web_fetch, todo_write, exit_plan_mode and search inside the chat folder', async () => {
    const host = await server(false);
    host.model.script({ kind: 'text', text: 'hi' });
    await ask(host, 'hello', true);

    expect(toolNames(host)).toStrictEqual(
      expect.arrayContaining(['web_fetch', 'todo_write', 'exit_plan_mode']),
    );
    expect(toolNames(host)).toStrictEqual(expect.arrayContaining(['glob', 'grep']));
    expect(toolNames(host)).not.toContain('bash');
  });

  it('gives the owner with native access glob and grep', async () => {
    const host = await server(true);
    host.model.script({ kind: 'text', text: 'hi' });
    await ask(host, 'hello', true);

    expect(toolNames(host)).toStrictEqual(expect.arrayContaining(['glob', 'grep']));
  });

  it('keeps project instruction files out of hub conversations', async () => {
    const host = await server(false);
    await writeFile(join(host.workspace, 'AGENTS.md'), 'Private owner rules.\n');
    host.model.script({ kind: 'text', text: 'ok' });
    await ask(host, 'hello', true);

    const text = spoken(host.model.requests[0]?.messages ?? [])
      .map((message) => message.text)
      .join('\n');
    expect(text).not.toContain('Private owner rules.');
  });
});
