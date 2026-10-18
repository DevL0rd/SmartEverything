import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DSH_SESSION_EVENTS_WRITE, type DshSessionEvent } from '@smarteverything/domain';
import { useRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

const MEBIBYTE = 1024 * 1024;

function bulky(seq: number, bytes: number): DshSessionEvent {
  return {
    type: 'user/message',
    seq,
    time: 1_000 + seq,
    data: {
      id: randomUUID(),
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'x'.repeat(bytes) }],
    },
    surfaceOp: 'append',
  };
}

function openLog(sizes: readonly number[]): string {
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  rig.opened.store.dshSessions.append(
    {
      claim: open.claim,
      operation_id: randomUUID(),
      events: DSH_SESSION_EVENTS_WRITE.parse(sizes.map((bytes, index) => bulky(index, bytes))),
    },
    principal,
  );
  return open.claim.session_id;
}

describe('reading native session events', () => {
  it('returns a small log in one page', () => {
    const id = openLog([10, 10, 10]);

    const page = rig.opened.store.dshSessions.read({ session_id: id }, rig.owner.profileId);

    expect(page.events.map((event) => event.seq)).toEqual([0, 1, 2]);
    expect(page.next_offset).toBeNull();
  });

  it('ends a page at the byte budget and continues from the next event', () => {
    const id = openLog([7 * MEBIBYTE, 7 * MEBIBYTE, 7 * MEBIBYTE, 10]);
    const { dshSessions } = rig.opened.store;

    const first = dshSessions.read({ session_id: id }, rig.owner.profileId);
    expect(first.events.map((event) => event.seq)).toEqual([0, 1]);
    expect(first.next_offset).toBe(2);

    const second = dshSessions.read({ session_id: id, offset: 2 }, rig.owner.profileId);
    expect(second.events.map((event) => event.seq)).toEqual([2, 3]);
    expect(second.next_offset).toBeNull();
  });

  it('still returns one event that is over the budget by itself', () => {
    const id = openLog([20 * MEBIBYTE, 10]);
    const { dshSessions } = rig.opened.store;

    const first = dshSessions.read({ session_id: id }, rig.owner.profileId);
    expect(first.events.map((event) => event.seq)).toEqual([0]);
    expect(first.next_offset).toBe(1);

    const second = dshSessions.read({ session_id: id, offset: 1 }, rig.owner.profileId);
    expect(second.events.map((event) => event.seq)).toEqual([1]);
    expect(second.next_offset).toBeNull();
  });
});
