import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import {
  DSH_SESSION_HEADER,
  DSH_SESSION_METADATA,
  DSH_WRITER_CLAIM,
} from '@smarteverything/domain';
import type { DshWriterClaim } from '@smarteverything/domain';
import type { HarnessCallRequest } from '@smarteverything/domain/node/harness-frames';
import { HARNESS_BOOT } from '../src/process/boot';
import { HarnessHub, type HarnessCallPort } from '../src/process/http';
import { HubSessionLog } from '../src/process/persistence';

const SESSION = 'session-persistence-calls';
const TARGET = { kind: 'device', device_id: randomUUID() } as const;

function metadata(nextSeq: number): unknown {
  return DSH_SESSION_METADATA.parse({
    chat_id: randomUUID(),
    profile_id: randomUUID(),
    header: DSH_SESSION_HEADER.parse({ version: 4, id: SESSION, createdAt: 1, isSeeded: false }),
    inherited_event_count: 0,
    next_seq: nextSeq,
    durable_seq: nextSeq - 1,
  });
}

class Hub implements HarnessCallPort {
  readonly requests: HarnessCallRequest[] = [];
  readonly pages: { offset: number; limit: number | undefined }[] = [];
  stored = 0;

  call(request: HarnessCallRequest): Promise<unknown> {
    this.requests.push(request);
    if (request.operation === 'stat') return Promise.resolve(metadata(this.stored));
    if (request.operation === 'append') {
      this.stored += request.input.events.length;
      return Promise.resolve(metadata(this.stored));
    }
    if (request.operation === 'flush') return Promise.resolve(metadata(this.stored));
    if (request.operation === 'read') {
      const { offset = 0, limit } = request.input;
      this.pages.push({ offset, limit });
      const count = Math.max(0, Math.min(limit ?? 10_000, this.stored - offset));
      const events = Array.from({ length: count }, (_, index) => ({
        type: 'turn/start',
        seq: offset + index,
        time: 1,
        data: { turn: 1 },
      }));
      const next = offset + count < this.stored && count === limit ? offset + count : null;
      return Promise.resolve({ metadata: metadata(this.stored), events, next_offset: next });
    }
    throw new Error(`Unexpected ${request.operation}.`);
  }

  count(operation: string): number {
    return this.requests.filter((request) => request.operation === operation).length;
  }
}

function claim(): DshWriterClaim {
  return DSH_WRITER_CLAIM.parse({
    session_id: SESSION,
    target: TARGET,
    runtime_instance: randomUUID(),
    connection_generation: randomUUID(),
    epoch: 1,
  });
}

function persistenceOn(hub: Hub): HubSessionLog {
  const boot = HARNESS_BOOT.parse({
    type: 'harness_boot',
    protocol: 1,
    device_id: TARGET.device_id,
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

function event(seq: number): SessionEvent {
  return { type: 'turn/start', seq: SessionSeq(seq), time: 1, data: { turn: 1 } };
}

describe('the machine side of a conversation log', () => {
  it('asks the hub for the session metadata once and tracks it from append replies', async () => {
    const hub = new Hub();
    const persistence = persistenceOn(hub);
    const held = claim();
    persistence.bind(held);

    expect((await persistence.metadata(SESSION)).next_seq).toBe(0);
    await persistence.append(held, randomUUID(), [event(0), event(1)]);
    expect((await persistence.metadata(SESSION)).durable_seq).toBe(1);
    await persistence.flush(held, 2);
    expect((await persistence.metadata(SESSION)).next_seq).toBe(2);
    expect(hub.count('stat')).toBe(1);
  });

  it('asks the hub again after the session is attached again', async () => {
    const hub = new Hub();
    const persistence = persistenceOn(hub);
    const held = claim();
    persistence.bind(held);
    await persistence.metadata(SESSION);
    persistence.bind({ ...held, epoch: held.epoch + 1 });
    await persistence.metadata(SESSION);
    expect(hub.count('stat')).toBe(2);
  });

  it('reads only the requested slice of the log', async () => {
    const hub = new Hub();
    hub.stored = 50;
    const persistence = persistenceOn(hub);

    const slice = await persistence.read(SessionId(SESSION), { offset: 40, length: 5 });

    expect(slice).toHaveLength(5);
    expect(hub.pages).toEqual([{ offset: 40, limit: 5 }]);
  });
});
