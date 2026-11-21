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

async function openLog(
  sizes: readonly number[],
): Promise<{ readonly id: string; readonly base: number }> {
  const chat = rig.newChat(rig.hub.target);
  const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  const base = rig.opened.store.dshSessions.stat(
    open.claim.session_id,
    rig.owner.profileId,
  )?.next_seq;
  if (base === undefined) throw new Error('The native session was not opened.');
  await rig.opened.store.live.dshSessions.append(
    {
      claim: open.claim,
      operation_id: randomUUID(),
      events: DSH_SESSION_EVENTS_WRITE.parse(
        sizes.map((bytes, index) => bulky(base + index, bytes)),
      ),
    },
    principal,
  );
  return { id: open.claim.session_id, base };
}

describe('reading native session events', () => {
  it('returns a small log in one page', async () => {
    const { id, base } = await openLog([10, 10, 10]);

    const page = rig.opened.store.dshSessions.read(
      { session_id: id, offset: base },
      rig.owner.profileId,
    );

    expect(page.events.map((event) => event.seq)).toEqual([base, base + 1, base + 2]);
    expect(page.next_offset).toBeNull();
  });

  it('ends a page at the byte budget and continues from the next event', async () => {
    const { id, base } = await openLog([7 * MEBIBYTE, 7 * MEBIBYTE, 7 * MEBIBYTE, 10]);
    const { dshSessions } = rig.opened.store;

    const first = dshSessions.read({ session_id: id, offset: base }, rig.owner.profileId);
    expect(first.events.map((event) => event.seq)).toEqual([base, base + 1]);
    expect(first.next_offset).toBe(base + 2);

    const second = dshSessions.read({ session_id: id, offset: base + 2 }, rig.owner.profileId);
    expect(second.events.map((event) => event.seq)).toEqual([base + 2, base + 3]);
    expect(second.next_offset).toBeNull();
  });

  it('still returns one event that is over the budget by itself', async () => {
    const { id, base } = await openLog([20 * MEBIBYTE, 10]);
    const { dshSessions } = rig.opened.store;

    const first = dshSessions.read({ session_id: id, offset: base }, rig.owner.profileId);
    expect(first.events.map((event) => event.seq)).toEqual([base]);
    expect(first.next_offset).toBe(base + 1);

    const second = dshSessions.read({ session_id: id, offset: base + 1 }, rig.owner.profileId);
    expect(second.events.map((event) => event.seq)).toEqual([base + 1]);
    expect(second.next_offset).toBeNull();
  });
});
