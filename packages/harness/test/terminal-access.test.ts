import { afterEach, describe, expect, it } from 'vitest';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiHarnessPermission } from '@smarteverything/domain';
import { bootRuntime, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const READ_ONLY: AiHarnessPermission = { sandbox: 'read-only', approval: 'on-request' };
const WORKSPACE: AiHarnessPermission = { sandbox: 'workspace-write', approval: 'on-request' };

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function touchThroughTerminal(
  host: RuntimeFixture,
  permission: AiHarnessPermission,
  path: string,
): Promise<void> {
  host.model.script(
    { kind: 'tool', id: 'o1', name: 'terminal_open', input: { type: 'shell', name: 'main' } },
    {
      kind: 'tool',
      id: 's1',
      name: 'terminal_send',
      input: { sessionId: 'pty-1', text: `echo data > '${path}'` },
    },
    { kind: 'text', text: 'done' },
  );
  const session = await host.runtime.create({ ...host.sessionOptions(), permission });
  session.text('write through the terminal');
  await turnsFinished(host, session, 1);
}

describe('terminal sessions are confined by the access mode', () => {
  it('read-only access cannot write through a terminal and asks nobody', async () => {
    fixture = await bootRuntime({ approval: 'rejected' });
    const outside = join(fixture.workspace, 'inside.txt');

    await touchThroughTerminal(fixture, READ_ONLY, outside);

    expect(await exists(outside)).toBe(false);
    expect(fixture.approvals).toHaveLength(0);
  });

  it('workspace access writes inside the workspace but not outside it', async () => {
    fixture = await bootRuntime({ approval: 'rejected' });
    const inside = join(fixture.workspace, 'inside.txt');
    const outside = join(fixture.directory, 'outside.txt');

    await touchThroughTerminal(fixture, WORKSPACE, inside);
    expect(await exists(inside)).toBe(true);
    fixture.model.script(
      { kind: 'tool', id: 'o2', name: 'terminal_open', input: { type: 'shell', name: 'second' } },
      {
        kind: 'tool',
        id: 's2',
        name: 'terminal_send',
        input: { sessionId: 'pty-2', text: `echo data > '${outside}'` },
      },
      { kind: 'text', text: 'done' },
    );
    const session = await fixture.runtime.create({
      ...fixture.sessionOptions(),
      permission: WORKSPACE,
    });
    session.text('write outside');
    await turnsFinished(fixture, session, 1);

    expect(await exists(outside)).toBe(false);
    expect(fixture.approvals).toHaveLength(0);
  });
});
