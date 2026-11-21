import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DSH_SESSION_EVENTS_WRITE, type DshSessionEvent } from '@smarteverything/domain';
import { Sql } from '../../src/store/sql';
import { DshSessionStorageError } from '../../src/store/repositories/dsh-session-errors';
import { useRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
let base = 0;
useRig((made) => {
  rig = made;
});
afterEach(() => {
  vi.restoreAllMocks();
});

const SOURCES = {
  system: { kind: 'system-prompt' },
  user: { kind: 'user' },
  assistant: { kind: 'model', provider: 'scripted', model: 'model-a' },
} as const;

function message(role: keyof typeof SOURCES, text: string): DshSessionEvent['data'] {
  return { id: randomUUID(), role, source: SOURCES[role], content: [{ type: 'text', text }] };
}

function appended(seq: number, type: string, text: string): DshSessionEvent {
  const role =
    type === 'system/message' ? 'system' : type === 'user/message' ? 'user' : 'assistant';
  const data =
    type === 'user/message'
      ? message(role, text)
      : { turn: 0, step: 0, stream: [], message: message(role, text) };
  return { type, seq: base + seq, time: 1_000 + seq, data, surfaceOp: 'append' };
}

function replacing(seq: number, text: string, from: number, to: number): DshSessionEvent {
  return {
    ...appended(seq, 'user/message', text),
    surfaceOp: { op: 'replace', startSeq: base + from, endSeq: base + to },
    sourceEventSeqs: Array.from({ length: to - from + 1 }, (_, index) => base + from + index),
  };
}

function requestHeader(seq: number): DshSessionEvent {
  return {
    type: 'request/header',
    seq: base + seq,
    time: 1_000 + seq,
    ignorable: true,
    data: {
      reason: 'initial',
      header: {
        config: { provider: 'scripted', model: 'model-a' },
        tools: [{ name: 'bash', description: 'Run a command', parameters: {} }],
      },
    },
  };
}

function developerAddition(seq: number, headerSeq: number, toolName: string): DshSessionEvent {
  return {
    type: 'developer/message',
    seq: base + seq,
    time: 1_000 + seq,
    ignorable: true,
    surfaceOp: 'append',
    data: {
      turn: 0,
      step: 0,
      headerSeq: base + headerSeq,
      message: {
        id: randomUUID(),
        role: 'developer',
        source: { kind: 'tools' },
        content: [{ type: 'tool-addition', toolName }],
      },
    },
  };
}

interface Session {
  readonly append: (events: readonly DshSessionEvent[]) => Promise<void>;
  readonly appendHere: (events: readonly DshSessionEvent[]) => void;
  readonly nextSeq: () => number;
}

async function openSession(): Promise<Session> {
  const chat = rig.newChat(rig.hub.target);
  const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  const { dshSessions } = rig.opened.store;
  base = dshSessions.stat(open.claim.session_id, rig.owner.profileId)?.next_seq ?? 0;
  return {
    append: async (events): Promise<void> => {
      await rig.opened.store.live.dshSessions.append(
        {
          claim: open.claim,
          operation_id: randomUUID(),
          events: DSH_SESSION_EVENTS_WRITE.parse(events),
        },
        principal,
      );
    },
    appendHere: (events): void => {
      dshSessions.append(
        {
          claim: open.claim,
          operation_id: randomUUID(),
          events: DSH_SESSION_EVENTS_WRITE.parse(events),
        },
        principal,
        () => undefined,
      );
    },
    nextSeq: (): number =>
      (dshSessions.stat(open.claim.session_id, rig.owner.profileId)?.next_seq ?? 0) - base,
  };
}

describe('appending native session events', () => {
  it('accepts a replacement of a node that an earlier append placed on the surface', async () => {
    const session = await openSession();
    await session.append([
      appended(0, 'system/message', 'rules'),
      appended(1, 'user/message', 'hi'),
    ]);
    await session.append([appended(2, 'user/message', 'again')]);

    await session.append([replacing(3, 'again please', 2, 2)]);

    expect(session.nextSeq()).toBe(4);
  });

  it('accepts a second replacement of the node the first one produced', async () => {
    const session = await openSession();
    await session.append([
      appended(0, 'system/message', 'rules'),
      appended(1, 'user/message', 'hi'),
    ]);
    await session.append([replacing(2, 'hey', 1, 1)]);

    await session.append([replacing(3, 'hello', 2, 2)]);

    expect(session.nextSeq()).toBe(4);
  });

  it('refuses a replacement of a node that is no longer on the surface, and stays usable', async () => {
    const session = await openSession();
    await session.append([
      appended(0, 'system/message', 'rules'),
      appended(1, 'user/message', 'hi'),
    ]);
    await session.append([replacing(2, 'hey', 1, 1)]);

    await expect(session.append([replacing(3, 'again', 1, 1)])).rejects.toThrow(
      DshSessionStorageError,
    );
    await session.append([replacing(3, 'again', 2, 2)]);

    expect(session.nextSeq()).toBe(4);
  });

  it('refuses a replacement that does not cite every node it shadows', async () => {
    const session = await openSession();
    await session.append([
      appended(0, 'system/message', 'rules'),
      appended(1, 'user/message', 'hi'),
      appended(2, 'user/message', 'hello'),
    ]);
    const partial: DshSessionEvent = {
      ...replacing(3, 'summary', 1, 2),
      sourceEventSeqs: [base + 1],
    };

    await expect(session.append([partial])).rejects.toThrow(
      'must cite every shadowed surface node',
    );
  });

  it('refuses to replace the system head with anything but one system message', async () => {
    const session = await openSession();
    await session.append([
      appended(0, 'system/message', 'rules'),
      appended(1, 'user/message', 'hi'),
    ]);

    await expect(session.append([replacing(2, 'rules now', 0, 0)])).rejects.toThrow(
      'system surface head',
    );
  });

  it('checks a developer tool addition against the stored request header', async () => {
    const session = await openSession();
    await session.append([appended(0, 'system/message', 'rules'), requestHeader(1)]);

    await session.append([developerAddition(2, 1, 'bash')]);
    expect(session.nextSeq()).toBe(3);
    await expect(session.append([developerAddition(3, 1, 'missing')])).rejects.toThrow(
      'exactly one complete historical tool definition',
    );
    await expect(session.append([developerAddition(3, 0, 'bash')])).rejects.toThrow(
      'headerSeq must reference an earlier request/header',
    );
  });

  it('stays correct when the transaction that appended is rolled back', async () => {
    const session = await openSession();
    session.appendHere([appended(0, 'system/message', 'rules'), appended(1, 'user/message', 'hi')]);

    expect(() => {
      rig.opened.store.durableWrite(() => {
        session.appendHere([replacing(2, 'hey', 1, 1)]);
        throw new Error('abort');
      });
    }).toThrow('abort');
    expect(session.nextSeq()).toBe(2);
    session.appendHere([replacing(2, 'hello', 1, 1)]);

    expect(session.nextSeq()).toBe(3);
  });

  it('does not read the stored log again once the session is warm', async () => {
    const session = await openSession();
    session.appendHere([appended(0, 'system/message', 'rules'), appended(1, 'user/message', 'hi')]);
    const all = vi.spyOn(Sql.prototype, 'all');

    session.appendHere([appended(2, 'user/message', 'hello')]);
    session.appendHere([replacing(3, 'hello there', 2, 2)]);

    expect(all.mock.calls.filter(([, text]) => text.includes('dsh_session_events'))).toStrictEqual(
      [],
    );
  });
});
