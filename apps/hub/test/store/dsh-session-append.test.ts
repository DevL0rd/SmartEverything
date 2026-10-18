import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DSH_SESSION_EVENTS_WRITE, type DshSessionEvent } from '@smarteverything/domain';
import { Sql } from '../../src/store/sql';
import { DshSessionStorageError } from '../../src/store/repositories/dsh-session-errors';
import { useRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
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
  return { type, seq, time: 1_000 + seq, data, surfaceOp: 'append' };
}

function replacing(seq: number, text: string, from: number, to: number): DshSessionEvent {
  return {
    ...appended(seq, 'user/message', text),
    surfaceOp: { op: 'replace', startSeq: from, endSeq: to },
    sourceEventSeqs: Array.from({ length: to - from + 1 }, (_, index) => from + index),
  };
}

function requestHeader(seq: number): DshSessionEvent {
  return {
    type: 'request/header',
    seq,
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
    seq,
    time: 1_000 + seq,
    ignorable: true,
    surfaceOp: 'append',
    data: {
      turn: 0,
      step: 0,
      headerSeq,
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
  readonly append: (events: readonly DshSessionEvent[]) => void;
  readonly nextSeq: () => number;
}

function openSession(): Session {
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  const { dshSessions } = rig.opened.store;
  return {
    append: (events): void => {
      dshSessions.append(
        {
          claim: open.claim,
          operation_id: randomUUID(),
          events: DSH_SESSION_EVENTS_WRITE.parse(events),
        },
        principal,
      );
    },
    nextSeq: (): number =>
      dshSessions.stat(open.claim.session_id, rig.owner.profileId)?.next_seq ?? 0,
  };
}

describe('appending native session events', () => {
  it('accepts a replacement of a node that an earlier append placed on the surface', () => {
    const session = openSession();
    session.append([appended(0, 'system/message', 'rules'), appended(1, 'user/message', 'hi')]);
    session.append([appended(2, 'user/message', 'again')]);

    session.append([replacing(3, 'again please', 2, 2)]);

    expect(session.nextSeq()).toBe(4);
  });

  it('accepts a second replacement of the node the first one produced', () => {
    const session = openSession();
    session.append([appended(0, 'system/message', 'rules'), appended(1, 'user/message', 'hi')]);
    session.append([replacing(2, 'hey', 1, 1)]);

    session.append([replacing(3, 'hello', 2, 2)]);

    expect(session.nextSeq()).toBe(4);
  });

  it('refuses a replacement of a node that is no longer on the surface, and stays usable', () => {
    const session = openSession();
    session.append([appended(0, 'system/message', 'rules'), appended(1, 'user/message', 'hi')]);
    session.append([replacing(2, 'hey', 1, 1)]);

    expect(() => {
      session.append([replacing(3, 'again', 1, 1)]);
    }).toThrow(DshSessionStorageError);
    session.append([replacing(3, 'again', 2, 2)]);

    expect(session.nextSeq()).toBe(4);
  });

  it('refuses a replacement that does not cite every node it shadows', () => {
    const session = openSession();
    session.append([
      appended(0, 'system/message', 'rules'),
      appended(1, 'user/message', 'hi'),
      appended(2, 'user/message', 'hello'),
    ]);
    const partial: DshSessionEvent = {
      ...replacing(3, 'summary', 1, 2),
      sourceEventSeqs: [1],
    };

    expect(() => {
      session.append([partial]);
    }).toThrow('must cite every shadowed surface node');
  });

  it('refuses to replace the system head with anything but one system message', () => {
    const session = openSession();
    session.append([appended(0, 'system/message', 'rules'), appended(1, 'user/message', 'hi')]);

    expect(() => {
      session.append([replacing(2, 'rules now', 0, 0)]);
    }).toThrow('system surface head');
  });

  it('checks a developer tool addition against the stored request header', () => {
    const session = openSession();
    session.append([appended(0, 'system/message', 'rules'), requestHeader(1)]);

    session.append([developerAddition(2, 1, 'bash')]);
    expect(session.nextSeq()).toBe(3);
    expect(() => {
      session.append([developerAddition(3, 1, 'missing')]);
    }).toThrow('exactly one complete historical tool definition');
    expect(() => {
      session.append([developerAddition(3, 0, 'bash')]);
    }).toThrow('headerSeq must reference an earlier request/header');
  });

  it('stays correct when the transaction that appended is rolled back', () => {
    const session = openSession();
    session.append([appended(0, 'system/message', 'rules'), appended(1, 'user/message', 'hi')]);

    expect(() => {
      rig.opened.store.durableWrite(() => {
        session.append([replacing(2, 'hey', 1, 1)]);
        throw new Error('abort');
      });
    }).toThrow('abort');
    expect(session.nextSeq()).toBe(2);
    session.append([replacing(2, 'hello', 1, 1)]);

    expect(session.nextSeq()).toBe(3);
  });

  it('does not read the stored log again once the session is warm', () => {
    const session = openSession();
    session.append([appended(0, 'system/message', 'rules'), appended(1, 'user/message', 'hi')]);
    const all = vi.spyOn(Sql.prototype, 'all');

    session.append([appended(2, 'user/message', 'hello')]);
    session.append([replacing(3, 'hello there', 2, 2)]);

    expect(all.mock.calls.filter(([, text]) => text.includes('dsh_session_events'))).toStrictEqual(
      [],
    );
  });
});
