import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { afterEach, describe, expect, it } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { AiHarnessEvent } from '@smarteverything/domain';
import { PLUGINS } from '../src/plugins';
import * as ConversationProjector from '../src/plugins/conversation-projector';
import { projectDelivery } from '../src/plugins/conversation-projector';
import type { ProjectedOp } from '../src/plugins/conversation-projector';
import { ReducerRig } from './support/reducer-rig';
import { bootRuntime, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

interface Record {
  readonly type: string;
  readonly seq: number;
  readonly surfaceOp?: unknown;
  readonly data?: object;
}

function userMessage(seq: number, id: string): Record {
  return {
    type: 'user/message',
    seq,
    surfaceOp: 'append',
    data: { id, role: 'user', content: [{ type: 'text', text: 'work' }] },
  };
}

function assistant(seq: number, content: readonly unknown[], extra: Partial<Record> = {}): Record {
  return {
    type: 'assistant/message',
    seq,
    surfaceOp: 'append',
    data: { turn: 1, step: 0, message: { content }, stream: [] },
    ...extra,
  };
}

function toolCall(seq: number, callId: string, name: string): Record {
  return {
    type: 'tool/call',
    seq,
    data: { turn: 1, step: 0, callId, name, arguments: '{"a":1}' },
  };
}

function toolResult(seq: number, callId: string, text: string, isError = false): Record {
  return {
    type: 'tool/result',
    seq,
    surfaceOp: 'append',
    data: {
      turn: 1,
      step: 0,
      message: { toolCallId: callId, isError, content: [{ type: 'text', text }] },
    },
  };
}

function turnEnd(seq: number, reason: object): Record {
  return { type: 'turn/end', seq, data: { turn: 1, reason } };
}

function turn(delivery: string): readonly Record[] {
  return [
    { type: 'turn/start', seq: 0, data: { turn: 1 } },
    userMessage(1, delivery),
    assistant(2, [
      { type: 'reasoning', text: 'Thinking. ' },
      { type: 'text', text: 'Looking. ' },
      { type: 'tool-call', id: 'c1', name: 'read', arguments: '{"a":1}' },
    ]),
    toolCall(3, 'c1', 'read'),
    toolResult(4, 'c1', 'contents'),
    assistant(5, [{ type: 'text', text: 'Done.' }]),
    turnEnd(6, { kind: 'completed' }),
  ];
}

describe('projecting the turn of one delivery', () => {
  it('lists the reasoning, text and tool operations in log order and the turn end', () => {
    const delivery = randomUUID();

    const projection = projectDelivery(turn(delivery), delivery);

    expect(projection.entered).toBe(true);
    expect(
      projection.ops.map((op) => (op.op === 'tool' ? `tool:${op.tool.state}` : op.op)),
    ).toStrictEqual(['reasoning', 'text', 'tool:running', 'tool:completed', 'text']);
    expect(projection.end).toStrictEqual({
      seq: 6,
      outcome: { kind: 'completed', interrupted: false },
    });
  });

  it('keeps only what follows its own message and stops at the first turn end', () => {
    const delivery = randomUUID();
    const before = [
      assistant(0, [{ type: 'text', text: 'earlier' }]),
      turnEnd(1, { kind: 'completed' }),
    ];
    const after = [assistant(7, [{ type: 'text', text: 'later' }])];
    const history = [...before, ...turn(delivery).map((r) => ({ ...r, seq: r.seq + 2 })), ...after];

    const projection = projectDelivery(history, delivery);

    expect(projection.ops.filter((op) => op.op === 'text')).toStrictEqual([
      { op: 'text', text: 'Looking. ' },
      { op: 'text', text: 'Done.' },
    ]);
  });

  it('reports a delivery the log never reached as not entered and unfinished', () => {
    const projection = projectDelivery(turn(randomUUID()), randomUUID());

    expect(projection).toStrictEqual({ entered: false, end: null, ops: [] });
  });

  it('reports a delivery that entered but has no end yet as unfinished', () => {
    const delivery = randomUUID();

    const projection = projectDelivery(turn(delivery).slice(0, 4), delivery);

    expect(projection.entered).toBe(true);
    expect(projection.end).toBeNull();
    expect(projection.ops).toHaveLength(3);
  });

  it('skips event types it does not know, replacements and replayed copies', () => {
    const delivery = randomUUID();
    const history = [
      ...turn(delivery).slice(0, 2),
      { type: 'plugin:smarteverything/anything', seq: 20, ignorable: true, data: { x: 1 } },
      { type: 'goal/change', seq: 21, data: { goal: 'x' } },
      assistant(22, [{ type: 'text', text: 'summary' }], {
        surfaceOp: { op: 'replace', startSeq: 0, endSeq: 1 },
      }),
      {
        ...assistant(23, [{ type: 'text', text: 'copy' }]),
        data: { message: { content: [{ type: 'text', text: 'copy' }] }, historyReplay: true },
      },
      assistant(24, [{ type: 'text', text: 'real' }]),
      turnEnd(25, { kind: 'completed' }),
    ];

    const projection = projectDelivery(history, delivery);

    expect(projection.ops).toStrictEqual([{ op: 'text', text: 'real' }]);
  });

  it('refuses a tool result whose call it never saw', () => {
    const delivery = randomUUID();

    expect(() =>
      projectDelivery([userMessage(0, delivery), toolResult(1, 'lost', 'x')], delivery),
    ).toThrow(/original retained call identity/u);
  });
});

describe('how the turn ended', () => {
  function outcome(reason: object): unknown {
    const delivery = randomUUID();
    return projectDelivery([userMessage(0, delivery), turnEnd(1, reason)], delivery).end?.outcome;
  }

  it.each<[string, object, object]>([
    ['completed', { kind: 'completed' }, { kind: 'completed', interrupted: false }],
    ['max tokens', { kind: 'max-tokens' }, { kind: 'completed', interrupted: false }],
    [
      'aborted',
      { kind: 'aborted', reason: { kind: 'user' } },
      { kind: 'completed', interrupted: true },
    ],
    ['interrupted', { kind: 'interrupted' }, { kind: 'completed', interrupted: true }],
    [
      'blocked',
      { kind: 'blocked' },
      { kind: 'failed', failure: { message: 'The turn was blocked.' } },
    ],
    [
      'an error',
      { kind: 'error', error: { message: 'No credit', code: '402' } },
      { kind: 'failed', failure: { message: '402: No credit' } },
    ],
  ])('maps %s', (_label, reason, expected) => {
    expect(outcome(reason)).toMatchObject(expected);
  });
});

describe('the live reducer and the projection', () => {
  function live(delivery: string, records: readonly Record[]): readonly AiHarnessEvent[] {
    const rig = new ReducerRig();
    rig.open();
    rig.event('agent/inbox/spliced', 100, {
      data: { target: 'next-turn', inserted: [{ id: delivery }] },
    });
    rig.event('turn/start', 101, { data: { turn: 1 } });
    rig.send({ kind: 'input', message_id: delivery, turn: 1 });
    return records
      .filter((record) => ['tool/call', 'tool/result', 'turn/end'].includes(record.type))
      .flatMap((record) => {
        const { type, seq, ...rest } = record;
        return rig.event(type, seq + 200, rest);
      });
  }

  function comparable(events: readonly AiHarnessEvent[]): unknown[] {
    return events.flatMap((event): unknown[] => {
      if (event.kind === 'tool')
        return [
          {
            callId: event.call_id,
            name: event.name,
            state: event.state,
            detail: event.detail,
            ...(event.input === undefined ? {} : { input: event.input }),
            ...(event.output === undefined ? {} : { output: event.output }),
          },
        ];
      if (event.kind === 'completed') return [{ kind: event.kind, interrupted: event.interrupted }];
      if (event.kind === 'failed') return [{ kind: event.kind, message: event.failure.message }];
      return [];
    });
  }

  function projected(
    ops: readonly ProjectedOp[],
    end: ReturnType<typeof projectDelivery>['end'],
  ): unknown[] {
    const tools = ops.flatMap((op) => (op.op === 'tool' ? [{ ...op.tool }] : []));
    if (end === null) return tools;
    return [
      ...tools,
      end.outcome.kind === 'completed'
        ? { kind: 'completed', interrupted: end.outcome.interrupted }
        : { kind: 'failed', message: end.outcome.failure.message },
    ];
  }

  it.each<[string, object, boolean]>([
    ['a finished turn', { kind: 'completed' }, false],
    ['a stopped turn', { kind: 'aborted', reason: { kind: 'user' } }, false],
    ['a failed turn', { kind: 'error', error: { message: 'Out of credit' } }, true],
  ])('say the same for %s', (_label, reason, failing) => {
    const delivery = randomUUID();
    const records = [
      ...turn(delivery).slice(0, 6),
      toolCall(6, 'c2', 'write'),
      toolResult(7, 'c2', 'no', failing),
      turnEnd(8, reason),
    ];

    const projection = projectDelivery(records, delivery);

    expect(projected(projection.ops, projection.end)).toStrictEqual(
      comparable(live(delivery, records)),
    );
  });
});

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

describe('the mounted projection', () => {
  it('is one of the host plugins', () => {
    expect(PLUGINS).toContain(ConversationProjector);
    expect(ConversationProjector.name).toBe('conversation-projector');
  });

  it('is driven live by the session events and says what the stored log says', async () => {
    let registry: Context['sessionProjections'] | undefined;
    let agents: Context['agents'] | undefined;
    fixture = await bootRuntime({
      mount: (ctx): void => {
        ctx.inject(['sessionProjections', 'agents'], (active): void => {
          registry = active.sessionProjections;
          agents = active.agents;
        });
      },
    });
    const sessionId = randomUUID();
    fixture.model.script(
      { kind: 'tool', id: 'g1', name: 'glob', input: { pattern: '*.nothing' } },
      { kind: 'text', text: 'all done' },
    );
    const session = await fixture.runtime.create(fixture.sessionOptions(sessionId));
    session.text('look around');
    await turnsFinished(fixture, session, 1);

    const stored = fixture.persistence.sessions.get(sessionId)?.events ?? [];
    const prompt = stored.find((event) => event.type === 'user/message');
    const delivery = z.object({ data: z.object({ id: z.string() }) }).parse(prompt).data.id;
    const agent = agents?.get(SessionId(sessionId));
    const live =
      agent === undefined
        ? undefined
        : registry?.stateOf(agent.session, 'smarteverythingConversation');
    const replayed = projectDelivery(stored, delivery);

    expect(replayed.entered).toBe(true);
    expect(replayed.ops.map((op) => op.op)).toStrictEqual(['tool', 'tool', 'text']);
    expect(live?.ended[delivery]).toStrictEqual({
      seq: replayed.end?.seq,
      outcome: replayed.end?.outcome,
      ops: replayed.ops,
    });
  });
});
