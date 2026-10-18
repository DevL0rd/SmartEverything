import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ApiError, DSH_WRITER_CLAIM, type DshWriterClaim } from '@smarteverything/domain';
import type { HarnessCallRequest } from '@smarteverything/domain/node/harness-frames';
import { SessionId } from '@deepseek-ai/dsh-session';
import { HarnessHub, type HarnessCallPort } from '../src/process/http';
import { HARNESS_BOOT } from '../src/process/boot';
import { HubSessionLog } from '../src/process/persistence';

function claim(epoch = 1, session: string = randomUUID()): DshWriterClaim {
  return DSH_WRITER_CLAIM.parse({
    session_id: session,
    target: { kind: 'device', device_id: randomUUID() },
    runtime_instance: randomUUID(),
    connection_generation: randomUUID(),
    epoch,
  });
}

class Hub implements HarnessCallPort {
  readonly requests: HarnessCallRequest[] = [];
  fenced = false;

  call(request: HarnessCallRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.fenced)
      return Promise.reject(new ApiError('ownership_lost', 'Another machine holds this session.'));
    if (request.operation === 'append' || request.operation === 'flush')
      return Promise.resolve(metadata(request.input.claim.session_id));
    throw new Error(`Unexpected ${request.operation}.`);
  }
}

function metadata(session: string): unknown {
  return {
    chat_id: randomUUID(),
    profile_id: randomUUID(),
    header: { version: 4, id: session, createdAt: 1, isSeeded: false },
    inherited_event_count: 0,
    next_seq: 0,
    durable_seq: -1,
  };
}

function persistenceOn(hub: Hub): HubSessionLog {
  const boot = HARNESS_BOOT.parse({
    type: 'harness_boot',
    protocol: 1,
    device_id: randomUUID(),
    generation: randomUUID(),
    runtime_instance: randomUUID(),
    name: 'Test machine',
    hub_url: 'http://hub.test',
    token: 'token',
    home_directory: '/home/test',
    state_directory: '/home/test/state',
    platform: 'linux',
    permission: { sandbox: 'danger-full-access', approval: 'never' },
  });
  return new HubSessionLog(new HarnessHub(boot, hub));
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a machine attached to a chat', () => {
  it('stays attached for as long as the hub does not attach the chat elsewhere', async () => {
    const hub = new Hub();
    const persistence = persistenceOn(hub);
    const lost = vi.fn();
    persistence.onOwnershipLost(lost);
    const held = claim();
    persistence.bind(held);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(hub.requests).toHaveLength(0);
    expect(lost).not.toHaveBeenCalled();
    expect(persistence.claim(held.session_id)).toStrictEqual(held);
  });

  it('writes with the epoch it was attached at', async () => {
    const hub = new Hub();
    const persistence = persistenceOn(hub);
    const held = claim(3);
    persistence.bind(held);

    await persistence.flush(held, 0);

    expect(hub.requests).toMatchObject([{ operation: 'flush', input: { claim: { epoch: 3 } } }]);
  });

  it('lets go of the chat when the hub refuses a write because another machine is attached', async () => {
    const hub = new Hub();
    const persistence = persistenceOn(hub);
    const lost = vi.fn();
    persistence.onOwnershipLost(lost);
    const held = claim();
    persistence.bind(held);
    hub.fenced = true;

    await expect(persistence.flush(held, 0)).rejects.toMatchObject({ code: 'ownership_lost' });

    expect(lost).toHaveBeenCalledExactlyOnceWith(held.session_id);
    expect(persistence.boundClaim(held.session_id)).toBeUndefined();
    expect(() => persistence.claim(SessionId(held.session_id))).toThrow(/unavailable/u);
  });

  it('writes nothing once it has let go of the chat', async () => {
    const hub = new Hub();
    const persistence = persistenceOn(hub);
    const held = claim();
    persistence.bind(held);
    persistence.lose(held.session_id);

    await expect(persistence.flush(held, 0)).rejects.toMatchObject({ code: 'ownership_lost' });

    expect(hub.requests).toHaveLength(0);
  });

  it('takes the newer attachment when the hub attaches it again', () => {
    const hub = new Hub();
    const persistence = persistenceOn(hub);
    const first = claim(1);
    persistence.bind(first);

    persistence.bind({ ...first, epoch: 2 });

    expect(persistence.claim(first.session_id).epoch).toBe(2);
  });
});
