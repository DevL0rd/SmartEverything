import { afterEach, describe, expect, it } from 'vitest';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiHarnessPermission } from '@smarteverything/domain';
import { bootRuntime, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const WORKSPACE: AiHarnessPermission = { sandbox: 'workspace-write', approval: 'on-request' };
const READ_ONLY: AiHarnessPermission = { sandbox: 'read-only', approval: 'on-request' };

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

describe('resuming a chat after its Access changed while it was closed', () => {
  it('opens with the current Access and applies it to the next tool call', async () => {
    fixture = await bootRuntime({ approval: 'rejected' });
    const host = fixture;
    const options = host.sessionOptions();
    const target = join(host.workspace, 'after-change.txt');
    await host.runtime.create({ ...options, permission: READ_ONLY });
    await host.runtime.close(options.sessionId);
    host.model.script(
      { kind: 'tool', id: 'write-1', name: 'write', input: { file_path: target, content: 'x' } },
      { kind: 'text', text: 'finished' },
    );

    const resumed = await host.runtime.resume({ ...options, permission: WORKSPACE });
    resumed.text('please write a file');
    await turnsFinished(host, resumed, 1);

    await expect(access(target)).resolves.toBeUndefined();
  });

  it('records the new mode in the session log', async () => {
    fixture = await bootRuntime({ approval: 'rejected' });
    const host = fixture;
    const options = host.sessionOptions();
    await host.runtime.create({ ...options, permission: READ_ONLY });
    await host.runtime.close(options.sessionId);

    await host.runtime.resume({ ...options, permission: WORKSPACE });

    const modes = host.persistence
      .events(options.sessionId)
      .filter((event) => event.type === 'sandbox/mode')
      .map((event) => event.data);
    expect(modes.at(-1)).toStrictEqual({ mode: 'workspace-write' });
  });
});
