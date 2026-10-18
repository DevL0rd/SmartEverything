import { afterEach, describe, expect, it } from 'vitest';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiHarnessPermission } from '@smarteverything/domain';
import { bootRuntime, spoken, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const FULL: AiHarnessPermission = { sandbox: 'danger-full-access', approval: 'never' };
const WORKSPACE: AiHarnessPermission = { sandbox: 'workspace-write', approval: 'on-request' };
const READ_ONLY: AiHarnessPermission = { sandbox: 'read-only', approval: 'on-request' };

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function booted(): Promise<RuntimeFixture> {
  fixture = await bootRuntime({ approval: 'rejected' });
  return fixture;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

interface Attempt {
  readonly session: { readonly flush: () => Promise<void> };
  readonly result: string;
}

async function askToWrite(
  host: RuntimeFixture,
  permission: AiHarnessPermission,
  path: string,
): Promise<Attempt> {
  host.model.script(
    { kind: 'tool', id: 'write-1', name: 'write', input: { file_path: path, content: 'data' } },
    { kind: 'text', text: 'finished' },
  );
  const session = await host.runtime.create({ ...host.sessionOptions(), permission });
  session.text('please write a file');
  await turnsFinished(host, session, 1);
  const result = host.model.requests[1]?.messages.at(-1);
  return { session, result: spoken(result === undefined ? [] : [result])[0]?.text ?? '' };
}

describe('the Access modes', () => {
  it('Full access writes anywhere on the machine without asking', async () => {
    const host = await booted();
    const outside = join(host.directory, 'outside.txt');

    await askToWrite(host, FULL, outside);

    expect(await exists(outside)).toBe(true);
    expect(host.approvals).toHaveLength(0);
  });

  it('workspace access writes inside the workspace', async () => {
    const host = await booted();
    const inside = join(host.workspace, 'inside.txt');

    await askToWrite(host, WORKSPACE, inside);

    expect(await exists(inside)).toBe(true);
  });

  it('read-only access refuses every write', async () => {
    const host = await booted();
    const inside = join(host.workspace, 'inside.txt');

    const { result } = await askToWrite(host, READ_ONLY, inside);

    expect(await exists(inside)).toBe(false);
    expect(result).toMatch(/sandbox: file access denied under read-only/u);
  });

  it('records the chosen mode in the session log', async () => {
    const host = await booted();
    const options = host.sessionOptions();

    await host.runtime.create({ ...options, permission: READ_ONLY });

    const recorded = host.persistence.events(options.sessionId);
    expect(recorded.find((event) => event.type === 'sandbox/mode')?.data).toStrictEqual({
      mode: 'read-only',
    });
    expect(recorded.map((event) => event.type)).toStrictEqual(
      expect.arrayContaining(['permission/preset', 'approval/policy']),
    );
  });

  it('changes the mode of a live session for the next tool call', async () => {
    const host = await booted();
    const inside = join(host.workspace, 'later.txt');
    host.model.script(
      { kind: 'tool', id: 'write-1', name: 'write', input: { file_path: inside, content: 'x' } },
      { kind: 'text', text: 'finished' },
    );
    const session = await host.runtime.create({ ...host.sessionOptions(), permission: READ_ONLY });

    await session.permission(WORKSPACE);
    session.text('please write a file');
    await turnsFinished(host, session, 1);

    expect(await exists(inside)).toBe(true);
  });

  it('resumes a closed session with the mode it was recorded with', async () => {
    const host = await booted();
    const options = host.sessionOptions();
    const inside = join(host.workspace, 'resumed.txt');
    await host.runtime.create({ ...options, permission: READ_ONLY });
    await host.runtime.close(options.sessionId);
    host.model.script(
      { kind: 'tool', id: 'write-1', name: 'write', input: { file_path: inside, content: 'x' } },
      { kind: 'text', text: 'finished' },
    );

    const resumed = await host.runtime.resume({ ...options, permission: READ_ONLY });
    resumed.text('please write a file');
    await turnsFinished(host, resumed, 1);

    expect(resumed.id).toBe(options.sessionId);
    expect(await exists(inside)).toBe(false);
    const result = host.model.requests[1]?.messages.at(-1);
    expect(spoken(result === undefined ? [] : [result])[0]?.text).toMatch(
      /sandbox: file access denied under read-only/u,
    );
  });
});
