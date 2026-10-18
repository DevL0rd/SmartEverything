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
  claim: ReturnType<typeof rig.service.prepare>['claim'],
  events: readonly DshSessionEvent[],
): { claim: typeof claim; operation_id: string; events: DshSessionEvent[] } {
  return {
    claim,
    operation_id: randomUUID(),
    events: DSH_SESSION_EVENTS_WRITE.parse(events),
  };
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
  it('lets the next machine take the session over, fencing every write of the machine before it', () => {
    const chat = rig.newChat(rig.hub.target);
    const first = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const { dshSessions } = rig.opened.store;
    dshSessions.append(appendInput(first.claim, [systemMessage(0)]), hubPrincipal());

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
    expect(() =>
      dshSessions.append(appendInput(first.claim, [userMessage(1, 'late')]), hubPrincipal()),
    ).toThrow(DshSessionStorageError);
    expect(
      dshSessions.append(appendInput(second.claim, [userMessage(1, 'now')]), deskPrincipal())
        .next_seq,
    ).toBe(2);
  });

  it('takes a new machine without asking what plugins it runs or which events it will write', () => {
    const chat = rig.newChat(rig.hub.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const { dshSessions } = rig.opened.store;
    dshSessions.append(appendInput(open.claim, [systemMessage(0)]), hubPrincipal());
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
      seq: 1,
      time: 1_001,
      ignorable: true,
      data: { text: 'written only by a plugin this machine runs' },
    };

    const written = dshSessions.append(appendInput(moved.claim, [own]), deskPrincipal());

    expect(written.next_seq).toBe(2);
  });

  it('refuses a write from a machine that is not the one the claim names', () => {
    const chat = rig.newChat(rig.hub.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);

    expect(() =>
      rig.opened.store.dshSessions.append(
        appendInput(open.claim, [systemMessage(0)]),
        deskPrincipal(),
      ),
    ).toThrow(/does not match the writer/u);
  });
});

describe('changing a native history on the hub', () => {
  it('writes without any machine and detaches the session so no machine writes over the change', () => {
    const chat = rig.newChat(rig.desk.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const { dshSessions } = rig.opened.store;
    dshSessions.append(appendInput(open.claim, [systemMessage(0)]), deskPrincipal());
    const stale = deskPrincipal();
    rig.service.directory.offline(rig.desk.target);
    const seen: number[] = [];
    dshSessions.onAppend((_id, events) => {
      seen.push(...events.map((event) => event.seq));
    });

    const written = dshSessions.rewrite(
      open.claim.session_id,
      rig.owner.profileId,
      DSH_SESSION_EVENTS_WRITE.parse([userMessage(1, 'edited')]),
    );

    expect(written.next_seq).toBe(2);
    expect(seen).toStrictEqual([1]);
    expect(dshSessions.attached(open.claim.session_id, rig.owner.profileId)).toBeNull();
    expect(() =>
      dshSessions.append(appendInput(open.claim, [userMessage(2, 'stale')]), stale),
    ).toThrow(/not attached/u);
  });

  it('lets the next attachment continue from the changed log at a newer epoch', () => {
    const chat = rig.newChat(rig.hub.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const { dshSessions } = rig.opened.store;
    dshSessions.append(appendInput(open.claim, [systemMessage(0)]), hubPrincipal());
    dshSessions.rewrite(
      open.claim.session_id,
      rig.owner.profileId,
      DSH_SESSION_EVENTS_WRITE.parse([userMessage(1, 'edited')]),
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
    expect(again.metadata.next_seq).toBe(2);
  });
});

describe('reading a whole native log', () => {
  it('returns every event in order and honours an offset and a length', () => {
    const chat = rig.newChat(rig.hub.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const { dshSessions } = rig.opened.store;
    const events = [
      systemMessage(0),
      userMessage(1, 'a'),
      userMessage(2, 'b'),
      userMessage(3, 'c'),
    ];
    dshSessions.append(appendInput(open.claim, events), hubPrincipal());

    const all = dshSessions.readAll(open.claim.session_id, rig.owner.profileId);
    const slice = dshSessions.readAll(open.claim.session_id, rig.owner.profileId, {
      offset: 1,
      length: 2,
    });

    expect(all.map((event) => event.seq)).toStrictEqual([0, 1, 2, 3]);
    expect(slice.map((event) => event.seq)).toStrictEqual([1, 2]);
  });

  it('follows the byte budget of a page until the log ends', () => {
    const chat = rig.newChat(rig.hub.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const { dshSessions } = rig.opened.store;
    const big = 'x'.repeat(7 * 1024 * 1024);
    dshSessions.append(
      appendInput(open.claim, [userMessage(0, big), userMessage(1, big), userMessage(2, big)]),
      hubPrincipal(),
    );

    const all = dshSessions.readAll(open.claim.session_id, rig.owner.profileId);

    expect(all.map((event) => event.seq)).toStrictEqual([0, 1, 2]);
  });
});
