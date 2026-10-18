import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  DSH_SESSION_ID,
  HARNESS_RUNTIME_REQUEST,
  type HarnessRuntimeReceipt,
  type HarnessRuntimeRequest,
  type NodeHarnessFrame,
} from '@smarteverything/domain';
import { RemoteHarness } from '../../src/server/harness-remote';
import { useRig, type Rig } from '../assistant/harness/support/rig';

const OPERATION_TIMEOUT_MS = 120_000;
const SESSION = DSH_SESSION_ID.parse('session-1');

let rig: Rig;
useRig((made) => {
  rig = made;
});

afterEach(() => {
  vi.useRealTimers();
});

function connect(): {
  readonly remote: RemoteHarness;
  readonly binding: ConstructorParameters<typeof RemoteHarness>[1];
  readonly terminate: Mock;
} {
  const binding = {
    device_id: randomUUID(),
    generation: randomUUID(),
    runtime_instance: randomUUID(),
  };
  const terminate = vi.fn();
  const remote = new RemoteHarness(rig.service, binding, {
    send: vi.fn(),
    terminate,
    authenticate: vi.fn(),
    admit: (): undefined => undefined,
  });
  return { remote, binding, terminate };
}

function request(kind: 'interrupt' | 'compact'): HarnessRuntimeRequest {
  return { kind, session_id: SESSION, expected_epoch: 1 };
}

function openRequest(): HarnessRuntimeRequest {
  return HARNESS_RUNTIME_REQUEST.parse({
    kind: 'open',
    chat_id: randomUUID(),
    claim: {
      session_id: SESSION,
      target: { kind: 'server' },
      runtime_instance: randomUUID(),
      connection_generation: randomUUID(),
      epoch: 1,
    },
    route: {
      route_id: randomUUID(),
      capability_revision: 'revision-1',
      model: 'model-1',
      effort: null,
    },
    permission: { sandbox: 'workspace-write', approval: 'on-request' },
    cwd: '/work',
    mode: 'create',
  });
}

function reply(
  binding: ConstructorParameters<typeof RemoteHarness>[1],
  id: string,
  state: HarnessRuntimeReceipt['state'] = 'completed',
): Extract<NodeHarnessFrame, { type: 'harness_reply' }> {
  const receipt: HarnessRuntimeReceipt = {
    operation_id: id,
    session_id: SESSION,
    epoch: 1,
    state,
    durable_seq: -1,
  };
  return { ...binding, type: 'harness_reply', id, result: { ok: true, receipt } };
}

describe('computer operation timeouts', () => {
  it('fails only the silent operation and keeps the connection and later operations', async () => {
    vi.useFakeTimers();
    const { remote, binding, terminate } = connect();
    const silent = randomUUID();
    const outcome = remote.execute(silent, request('interrupt'));
    const rejected = expect(outcome).rejects.toThrow('did not answer the interrupt operation');

    await vi.advanceTimersByTimeAsync(OPERATION_TIMEOUT_MS + 1);
    await rejected;
    expect(terminate).not.toHaveBeenCalled();
    expect(() => {
      remote.receive(reply(binding, silent));
    }).not.toThrow();

    const next = randomUUID();
    const answered = remote.execute(next, request('interrupt'));
    remote.receive(reply(binding, next));
    await expect(answered).resolves.toMatchObject({ operation_id: next });
  });

  it('lets a long compaction run as long as the computer needs', async () => {
    vi.useFakeTimers();
    const { remote, binding, terminate } = connect();
    const id = randomUUID();
    let settled = false;
    const outcome = remote.execute(id, request('compact')).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(OPERATION_TIMEOUT_MS * 10);
    expect(settled).toBe(false);
    expect(terminate).not.toHaveBeenCalled();

    remote.receive(reply(binding, id));
    await expect(outcome).resolves.toMatchObject({ operation_id: id });
  });

  it('accepts an open that takes longer than the operation timeout and registers the session', async () => {
    vi.useFakeTimers();
    const { remote, binding, terminate } = connect();
    const id = randomUUID();
    const outcome = remote.execute(id, openRequest());

    await vi.advanceTimersByTimeAsync(OPERATION_TIMEOUT_MS * 2);
    expect(terminate).not.toHaveBeenCalled();
    expect(remote.hasSession(SESSION, 1)).toBe(false);

    remote.receive(reply(binding, id, 'ready'));
    await expect(outcome).resolves.toMatchObject({ operation_id: id, state: 'ready' });
    expect(remote.hasSession(SESSION, 1)).toBe(true);
  });
});
