import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { AI_CODE_EXECUTION_TOOL_NAMES, AI_GOAL_TOOL_NAMES } from '@smarteverything/domain';
import type { AiHarnessPermission } from '@smarteverything/domain';
import { SUBAGENT_TOOL_NAMES } from '../src/plugins/subagents';
import type { HarnessAuthority, HarnessServerToolAccess } from '../src/host/server-policy';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const AUTHORITY: HarnessAuthority = { kind: 'manual', profileId: randomUUID() };

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

function hubAccess(native: boolean, refusal?: string): HarnessServerToolAccess {
  return {
    hubToolNames: () => ['home_read'],
    nativeAccess: () => native,
    deny: () => refusal,
  };
}

async function server(native: boolean, refusal?: string): Promise<RuntimeFixture> {
  fixture = await bootRuntime({
    target: { kind: 'server' },
    serverToolAccess: hubAccess(native, refusal),
    mount: (ctx) => {
      ctx.tools.register({
        name: 'home_read',
        description: 'Read the home.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        isConcurrencySafe: (): boolean => true,
        output: {
          schema: {
            type: 'object',
            properties: { rooms: { type: 'number' } },
            required: ['rooms'],
            additionalProperties: false,
          },
          render: (_raw, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        execute: () => Promise.resolve({ rooms: 2 }),
      });
    },
  });
  return fixture;
}

async function asked(
  host: RuntimeFixture,
  text: string,
  permission: AiHarnessPermission = { sandbox: 'workspace-write', approval: 'on-request' },
): Promise<void> {
  const session = await host.runtime.create({
    ...host.sessionOptions(),
    authority: AUTHORITY,
    permission,
  });
  session.text(text);
  await turnsFinished(host, session, 1);
}

describe('hub-hosted conversations', () => {
  it('require the initiating profile and explicit authority to open', async () => {
    const host = await server(false);

    await expect(host.runtime.create(host.sessionOptions())).rejects.toThrow(
      /require the initiating profile/u,
    );
  });

  it('offer the model conversation tools, hub tools and chat-folder files, never the shell', async () => {
    const host = await server(false);
    host.model.script({ kind: 'text', text: 'hello' });
    await asked(host, 'hi');

    const offered = host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(offered).toStrictEqual(
      expect.arrayContaining(['ask_user_question', 'read', 'write', 'edit', 'glob', 'grep']),
    );
    for (const forbidden of ['bash', 'job_list', 'set_working_directory'])
      expect(offered).not.toContain(forbidden);
  });

  it('let a member write and read a file inside the chat folder', async () => {
    const host = await server(false);
    const file = join(host.workspace, 'workspace', 'notes.txt');
    host.model.script(
      {
        kind: 'tool',
        id: 'c1',
        name: 'write',
        input: { file_path: 'workspace/notes.txt', content: 'x' },
      },
      { kind: 'text', text: 'ok' },
    );
    await mkdir(join(host.workspace, 'workspace'));
    await asked(host, 'write a note');

    expect(await readFile(file, 'utf8')).toBe('x');
  });

  it('refuse a shell call and a file outside the chat folder even if the model asks anyway', async () => {
    const host = await server(false);
    const outside = join(host.directory, 'escape.txt');
    await writeFile(outside, 'secret');
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'write', input: { file_path: outside, content: 'x' } },
      { kind: 'tool', id: 'c2', name: 'read', input: { file_path: '../escape.txt' } },
      { kind: 'tool', id: 'c3', name: 'glob', input: { pattern: '/etc/*' } },
      { kind: 'tool', id: 'c4', name: 'bash', input: { command: 'true' } },
      { kind: 'text', text: 'ok' },
    );
    await asked(host, 'write a file');

    const results = [1, 2, 3, 4].map((request) => {
      const last = host.model.requests[request]?.messages.at(-1);
      return spoken(last === undefined ? [] : [last])[0]?.text;
    });
    for (const text of results.slice(0, 3)) expect(text).toMatch(/outside this chat’s folder/u);
    expect(results[3]).toMatch(/for its owner|for the owner/u);
    expect(await readFile(outside, 'utf8')).toBe('secret');
  });

  it('offer the machine tools when the initiating owner has native access to the selected host', async () => {
    const host = await server(true);
    host.model.script({ kind: 'text', text: 'hello' });
    await asked(host, 'hi');

    const offered = host.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(offered).toStrictEqual(expect.arrayContaining(['bash', 'write', 'read']));
  });

  it('offer every person the subagent, goal and memory tools, and the owner the loop tools', async () => {
    const member = await server(false);
    member.model.script({ kind: 'text', text: 'hello' });
    await asked(member, 'hi');
    const offered = member.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(offered).toStrictEqual(
      expect.arrayContaining([...SUBAGENT_TOOL_NAMES, ...AI_GOAL_TOOL_NAMES]),
    );
    for (const owned of AI_CODE_EXECUTION_TOOL_NAMES) expect(offered).not.toContain(owned);
    await member.dispose();

    const owner = await server(true);
    owner.model.script({ kind: 'text', text: 'hello' });
    await asked(owner, 'hi');
    const owned = owner.model.requests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(owned).toStrictEqual(expect.arrayContaining([...AI_CODE_EXECUTION_TOOL_NAMES]));
  });

  it('run a helper the model delegates to and read its goal', async () => {
    const host = await server(false);
    host.model.script(
      { kind: 'tool', id: 'g1', name: 'get_goal', input: {} },
      {
        kind: 'tool',
        id: 'd1',
        name: 'subagent',
        input: { description: 'rooms', prompt: 'Count the rooms and report.' },
      },
      { kind: 'tool', id: 'c1', name: 'home_read', input: {} },
      { kind: 'tool', id: 'c2', name: 'home_read', input: {} },
      { kind: 'text', text: 'two rooms' },
      { kind: 'text', text: 'two rooms' },
      { kind: 'text', text: 'done' },
    );
    const session = await host.runtime.create({ ...host.sessionOptions(), authority: AUTHORITY });
    session.text('count the rooms');

    await vi.waitFor(() => {
      expect(host.model.requests.length).toBeGreaterThan(3);
    });
    const goal = spoken(host.model.requests[1]?.messages.slice(-1) ?? [])[0]?.text ?? '';
    expect(goal).not.toMatch(/^Error/u);
    await vi.waitFor(() => {
      const child = host.model.requests.find(
        (request) =>
          spoken(request.messages).some(
            (message) => message.role === 'user' && message.text.includes('Count the rooms'),
          ) && spoken(request.messages.slice(-1))[0]?.text === '{"rooms":2}',
      );
      expect(child).toBeDefined();
    });
    const delegated = [...host.persistence.sessions.values()].filter(
      (stored) => stored.header.origin === 'subagent',
    );
    expect(delegated).toHaveLength(1);
  });

  it('run an exposed hub tool and return its result to the model', async () => {
    const host = await server(false);
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'home_read', input: {} },
      { kind: 'text', text: 'two rooms' },
    );
    await asked(host, 'how many rooms');

    const result = host.model.requests[1]?.messages.at(-1);
    expect(spoken(result === undefined ? [] : [result])[0]?.text).toBe('{"rooms":2}');
  });

  it('report the access policy refusal of a hub tool instead of running it', async () => {
    const host = await server(false, 'This profile cannot read the home.');
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'home_read', input: {} },
      { kind: 'text', text: 'sorry' },
    );
    await asked(host, 'how many rooms');

    const result = host.model.requests[1]?.messages.at(-1);
    const text = spoken(result === undefined ? [] : [result])[0]?.text ?? '';
    expect(text.startsWith('Error:')).toBe(true);
  });

  it('let the model load any skill the runtime has registered, not only the product ones', async () => {
    const host = await server(false);
    host.model.script(
      { kind: 'tool', id: 'c1', name: 'skill', input: { name: 'my-own-skill' } },
      { kind: 'text', text: 'ok' },
    );
    await asked(host, 'use my skill');

    const result = host.model.requests[1]?.messages.at(-1);
    const text = spoken(result === undefined ? [] : [result])[0]?.text ?? '';
    expect(text).not.toMatch(/only embedded/u);
    expect(text).toMatch(/my-own-skill/u);
  });
});
