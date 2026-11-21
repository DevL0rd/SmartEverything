import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DSH_SESSION_EVENTS_WRITE, type DshSessionEvent } from '@smarteverything/domain';
import { DshSessionStorageError } from '../../src/store/repositories/dsh-session-errors';
import { useRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function systemMessage(seq: number): DshSessionEvent {
  return {
    type: 'system/message',
    seq,
    time: 1_000 + seq,
    surfaceOp: 'append',
    data: {
      turn: 0,
      step: 0,
      message: { id: randomUUID(), role: 'system', source: { kind: 'system-prompt' }, content: [] },
    },
  };
}

function userMessage(seq: number, text: string): DshSessionEvent {
  return {
    type: 'user/message',
    seq,
    time: 1_000 + seq,
    surfaceOp: 'append',
    data: {
      id: randomUUID(),
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text }],
    },
  };
}

function appendInput(
  claim: Awaited<ReturnType<typeof rig.service.prepare>>['claim'],
  events: readonly DshSessionEvent[],
): { claim: typeof claim; operation_id: string; events: DshSessionEvent[] } {
  return {
    claim,
    operation_id: randomUUID(),
    events: DSH_SESSION_EVENTS_WRITE.parse(events),
  };
}

function seededTo(claim: Awaited<ReturnType<typeof rig.service.prepare>>['claim']): number {
  const metadata = rig.opened.store.dshSessions.stat(claim.session_id, rig.owner.profileId);
  if (metadata === undefined) throw new Error(`Session ${claim.session_id} was not opened.`);
  return metadata.next_seq;
}

function seqs(through: number): number[] {
  return Array.from({ length: through + 1 }, (_, seq) => seq);
}

function hubPrincipal(): ReturnType<typeof rig.service.hostPrincipal> {
  return rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
}

function deskPrincipal(): ReturnType<typeof rig.service.hostPrincipal> {
  return rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.desk.target).host,
  );
}

describe('attaching a native session to a machine', () => {
  it('lets the next machine take the session over, fencing every write of the machine before it', async () => {
    const chat = rig.newChat(rig.hub.target);
    const first = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const base = seededTo(first.claim);
    const { dshSessions } = rig.opened.store;
    await rig.opened.store.live.dshSessions.append(
      appendInput(first.claim, [systemMessage(base)]),
      hubPrincipal(),
    );

    const second = dshSessions.acquire(
      {
        session_id: first.claim.session_id,
        target: rig.desk.target,
        runtime_instance: rig.service.directory.get(rig.desk.target).host.runtime_instance,
        connection_generation: rig.service.directory.get(rig.desk.target).host
          .connection_generation,
      },
      deskPrincipal(),
    );

    expect(second.claim.epoch).toBe(first.claim.epoch + 1);
    await expect(
      rig.opened.store.live.dshSessions.append(
        appendInput(first.claim, [userMessage(base + 1, 'late')]),
        hubPrincipal(),
      ),
    ).rejects.toThrow(DshSessionStorageError);
    expect(
      (
        await rig.opened.store.live.dshSessions.append(
          appendInput(second.claim, [userMessage(base + 1, 'now')]),
          deskPrincipal(),
        )
      ).next_seq,
    ).toBe(base + 2);
  });

  it('takes a new machine without asking what plugins it runs or which events it will write', async () => {
    const chat = rig.newChat(rig.hub.target);
    const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const base = seededTo(open.claim);
    const { dshSessions } = rig.opened.store;
    await rig.opened.store.live.dshSessions.append(
      appendInput(open.claim, [systemMessage(base)]),
      hubPrincipal(),
    );
    const host = rig.service.directory.get(rig.desk.target).host;
    const moved = dshSessions.acquire(
      {
        session_id: open.claim.session_id,
        target: rig.desk.target,
        runtime_instance: host.runtime_instance,
        connection_generation: host.connection_generation,
      },
      deskPrincipal(),
    );
    const own: DshSessionEvent = {
      type: 'plugin:desk-only/note',
      seq: base + 1,
      time: 1_001,
      ignorable: true,
      data: { text: 'written only by a plugin this machine runs' },
    };

    const written = await rig.opened.store.live.dshSessions.append(
      appendInput(moved.claim, [own]),
      deskPrincipal(),
    );

    expect(written.next_seq).toBe(base + 2);
  });

  it('refuses a write from a machine that is not the one the claim names', async () => {
    const chat = rig.newChat(rig.hub.target);
    const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const base = seededTo(open.claim);

    await expect(
      rig.opened.store.live.dshSessions.append(
        appendInput(open.claim, [systemMessage(base)]),
        deskPrincipal(),
      ),
    ).rejects.toThrow(/does not match the writer/u);
  });
});

describe('changing a native history on the hub', () => {
  it('writes without any machine and detaches the session so no machine writes over the change', async () => {
    const chat = rig.newChat(rig.desk.target);
    const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const base = seededTo(open.claim);
    const { dshSessions } = rig.opened.store;
    await rig.opened.store.live.dshSessions.append(
      appendInput(open.claim, [systemMessage(base)]),
      deskPrincipal(),
    );
    const stale = deskPrincipal();
    rig.service.directory.offline(rig.desk.target);
    const seen: number[] = [];
    rig.opened.store.live.dshSessions.onAppend((_id, events) => {
      seen.push(...events.map((event) => event.seq));
    });

    const written = await rig.opened.store.live.dshSessions.rewrite(
      open.claim.session_id,
      rig.owner.profileId,
      DSH_SESSION_EVENTS_WRITE.parse([userMessage(base + 1, 'edited')]),
    );

    expect(written.next_seq).toBe(base + 2);
    expect(seen).toStrictEqual([base + 1]);
    expect(dshSessions.attached(open.claim.session_id, rig.owner.profileId)).toBeNull();
    await expect(
      rig.opened.store.live.dshSessions.append(
        appendInput(open.claim, [userMessage(base + 2, 'stale')]),
        stale,
      ),
    ).rejects.toThrow(/not attached/u);
  });

  it('lets the next attachment continue from the changed log at a newer epoch', async () => {
    const chat = rig.newChat(rig.hub.target);
    const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const base = seededTo(open.claim);
    const { dshSessions } = rig.opened.store;
    await rig.opened.store.live.dshSessions.append(
      appendInput(open.claim, [systemMessage(base)]),
      hubPrincipal(),
    );
    await rig.opened.store.live.dshSessions.rewrite(
      open.claim.session_id,
      rig.owner.profileId,
      DSH_SESSION_EVENTS_WRITE.parse([userMessage(base + 1, 'edited')]),
    );
    const host = rig.service.directory.get(rig.hub.target).host;

    const again = dshSessions.acquire(
      {
        session_id: open.claim.session_id,
        target: rig.hub.target,
        runtime_instance: host.runtime_instance,
        connection_generation: host.connection_generation,
      },
      hubPrincipal(),
    );

    expect(again.claim.epoch).toBeGreaterThan(open.claim.epoch + 1);
    expect(again.metadata.next_seq).toBe(base + 2);
  });
});

describe('reading a whole native log', () => {
  it('returns every event in order and honours an offset and a length', async () => {
    const chat = rig.newChat(rig.hub.target);
    const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const base = seededTo(open.claim);
    const { dshSessions } = rig.opened.store;
    const events = [
      systemMessage(base),
      userMessage(base + 1, 'a'),
      userMessage(base + 2, 'b'),
      userMessage(base + 3, 'c'),
    ];
    await rig.opened.store.live.dshSessions.append(appendInput(open.claim, events), hubPrincipal());

    const all = dshSessions.readAll(open.claim.session_id, rig.owner.profileId);
    const slice = dshSessions.readAll(open.claim.session_id, rig.owner.profileId, {
      offset: base + 1,
      length: 2,
    });

    expect(all.map((event) => event.seq)).toStrictEqual(seqs(base + 3));
    expect(slice.map((event) => event.seq)).toStrictEqual([base + 1, base + 2]);
  });

  it('follows the byte budget of a page until the log ends', async () => {
    const chat = rig.newChat(rig.hub.target);
    const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const base = seededTo(open.claim);
    const { dshSessions } = rig.opened.store;
    const big = 'x'.repeat(7 * 1024 * 1024);
    await rig.opened.store.live.dshSessions.append(
      appendInput(open.claim, [
        userMessage(base, big),
        userMessage(base + 1, big),
        userMessage(base + 2, big),
      ]),
      hubPrincipal(),
    );

    const all = dshSessions.readAll(open.claim.session_id, rig.owner.profileId);

    expect(all.map((event) => event.seq)).toStrictEqual(seqs(base + 2));
  });
});
