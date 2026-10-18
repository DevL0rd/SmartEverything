import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DSH_SESSION_ACQUIRE,
  DSH_SESSION_CREATE,
  DSH_SESSION_EVENT_WRITE,
  DSH_SESSION_METADATA,
  DSH_WRITER_CLAIM,
  DSH_WRITER_CLAIM_WRITE,
} from '../src/dsh-sessions';

const SESSION = randomUUID();
const ATTACH = {
  target: { kind: 'server' },
  runtime_instance: randomUUID(),
  connection_generation: randomUUID(),
} as const;

describe('attaching a native session to a machine', () => {
  it('identifies an attachment by session, machine, runtime and epoch alone', () => {
    const claim = { ...ATTACH, session_id: SESSION, epoch: 3 };

    expect(DSH_WRITER_CLAIM.parse(claim)).toStrictEqual(claim);
    expect(DSH_WRITER_CLAIM_WRITE.parse(claim)).toStrictEqual(claim);
  });

  it('refuses a write that still carries lease fields', () => {
    const claim = { ...ATTACH, session_id: SESSION, epoch: 3, token: randomUUID() };

    expect(DSH_WRITER_CLAIM_WRITE.safeParse(claim).success).toBe(false);
  });

  it('needs no lease length and no operation identity to attach', () => {
    expect(DSH_SESSION_ACQUIRE.safeParse({ ...ATTACH, session_id: SESSION }).success).toBe(true);
  });

  it('creates a session without naming the plugins or event types of the machine', () => {
    const created = DSH_SESSION_CREATE.safeParse({
      ...ATTACH,
      chat_id: randomUUID(),
      header: { version: 4, id: SESSION, createdAt: 1, isSeeded: false },
      inherited_event_count: 0,
    });

    expect(created.success).toBe(true);
  });

  it('describes a stored session without a machine composition to match', () => {
    const metadata = DSH_SESSION_METADATA.safeParse({
      chat_id: randomUUID(),
      profile_id: randomUUID(),
      header: { version: 4, id: SESSION, createdAt: 1, isSeeded: false },
      inherited_event_count: 0,
      next_seq: 0,
      durable_seq: -1,
    });

    expect(metadata.success).toBe(true);
  });

  it('stores an event as the machine wrote it without re-checking the data of its own event types', () => {
    const event = { type: 'turn/start', seq: 0, time: 1, data: { turn: 'not a position' } };

    expect(DSH_SESSION_EVENT_WRITE.parse(event)).toStrictEqual(event);
  });
});
