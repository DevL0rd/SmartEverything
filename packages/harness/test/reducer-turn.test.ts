import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ReducerRig, only, stateOf, claimTurn } from './support/reducer-rig';

describe('a turn from the delivery that asked for it', () => {
  it('ties the claimed turn to its delivery and completes it with that identity', () => {
    const rig = new ReducerRig();
    rig.open();
    const delivery = randomUUID();
    rig.event('agent/inbox/spliced', 1, {
      data: { target: 'next-turn', inserted: [{ id: delivery }] },
    });
    rig.event('turn/start', 2);
    rig.durableSeq = 9;

    const claimed = stateOf(rig.send({ kind: 'input', message_id: delivery, turn: 1 }));
    const text = only(rig.send({ kind: 'text', delta: 'hi' }));
    const ended = only(
      rig.event('turn/end', 5, { data: { turn: 1, reason: { kind: 'completed' } } }),
    );

    expect(claimed).toMatchObject({ delivery_id: delivery, native_turn: 1 });
    expect(text).toMatchObject({
      kind: 'text',
      delta: 'hi',
      delivery_id: delivery,
      native_turn: 1,
    });
    expect(ended).toMatchObject({
      kind: 'completed',
      interrupted: false,
      durable_seq: 5,
      delivery_id: delivery,
      native_turn: 1,
    });
  });

  it('never reports a durable position beyond what the hub stored', () => {
    const rig = new ReducerRig();
    rig.open();
    const delivery = randomUUID();
    claimTurn(rig, delivery, 1);
    rig.durableSeq = 3;

    const ended = only(
      rig.event('turn/end', 8, { data: { turn: 1, reason: { kind: 'aborted' } } }),
    );

    expect(ended).toMatchObject({ kind: 'completed', interrupted: true, durable_seq: 3 });
  });

  it('forgets the delivery once the turn ended', () => {
    const rig = new ReducerRig();
    rig.open();
    claimTurn(rig, randomUUID(), 1);
    rig.event('turn/end', 5, { data: { turn: 1, reason: { kind: 'completed' } } });

    const after = only(rig.send({ kind: 'text', delta: 'later' }));

    expect(after.delivery_id).toBeUndefined();
  });

  it('ignores input claims it never saw queued', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(rig.send({ kind: 'input', message_id: randomUUID(), turn: 1 })).toStrictEqual([]);
  });

  it('does not track queued messages that are not delivery ids', () => {
    const rig = new ReducerRig();
    rig.open();
    rig.event('agent/inbox/spliced', 1, {
      data: { target: 'next-turn', inserted: [{ id: 'steer-note' }] },
    });

    expect(rig.send({ kind: 'input', message_id: 'steer-note', turn: 1 })).toStrictEqual([]);
  });

  it('does not track messages spliced for the current step', () => {
    const rig = new ReducerRig();
    rig.open();
    const id = randomUUID();
    rig.event('agent/inbox/spliced', 1, { data: { target: 'next-step', inserted: [{ id }] } });

    expect(rig.send({ kind: 'input', message_id: id, turn: 1 })).toStrictEqual([]);
  });

  it('forgets a queued message once its user message entered the log', () => {
    const rig = new ReducerRig();
    rig.open();
    const id = randomUUID();
    rig.event('agent/inbox/spliced', 1, { data: { target: 'next-turn', inserted: [{ id }] } });
    rig.event('user/message', 2, { surfaceOp: 'append', data: { id } });

    expect(rig.send({ kind: 'input', message_id: id, turn: 1 })).toStrictEqual([]);
  });

  it('answers discarded queued input as an interrupted completion without a turn', () => {
    const rig = new ReducerRig();
    rig.open();
    const id = randomUUID();
    rig.event('agent/inbox/spliced', 1, { data: { target: 'next-turn', inserted: [{ id }] } });
    rig.durableSeq = 4;

    const discarded = only(rig.send({ kind: 'discarded', message_id: id }));

    expect(discarded).toMatchObject({
      kind: 'completed',
      delivery_id: id,
      input_discarded: true,
      interrupted: true,
      durable_seq: 4,
    });
    expect(discarded).not.toHaveProperty('native_turn');
  });

  it('ignores discarded input it never saw queued', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(rig.send({ kind: 'discarded', message_id: randomUUID() })).toStrictEqual([]);
  });

  it('ignores the end of a turn it did not claim', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(
      rig.event('turn/end', 3, { data: { turn: 2, reason: { kind: 'completed' } } }),
    ).toStrictEqual([]);
  });

  it.each([
    [
      'error',
      { kind: 'error', error: { message: 'Insufficient credits' } },
      'Insufficient credits',
    ],
    ['error without a message', { kind: 'error', error: { message: '' } }, 'The turn failed.'],
    ['blocked', { kind: 'blocked' }, 'The turn was blocked.'],
  ])('fails the turn when it ended with %s', (_name, reason, message) => {
    const rig = new ReducerRig();
    rig.open();
    claimTurn(rig, randomUUID(), 1);

    const ended = only(rig.event('turn/end', 5, { data: { turn: 1, reason } }));

    expect(ended).toMatchObject({
      kind: 'failed',
      failure: { code: 'operation_failed', message, retry_at: null },
    });
  });
});

describe('tools', () => {
  it('reports a call as running and its result as completed with the retained name', () => {
    const rig = new ReducerRig();
    rig.open();

    const call = only(
      rig.event('tool/call', 3, { data: { callId: 'c1', name: 'write', arguments: '{"a":1}' } }),
    );
    const result = only(
      rig.event('tool/result', 4, {
        surfaceOp: 'append',
        data: { message: { toolCallId: 'c1', content: [{ type: 'text', text: 'done' }] } },
      }),
    );

    expect(call).toMatchObject({
      kind: 'tool',
      call_id: 'c1',
      name: 'write',
      state: 'running',
      input: '{"a":1}',
      detail: null,
      target: { kind: 'server' },
    });
    expect(result).toMatchObject({
      kind: 'tool',
      call_id: 'c1',
      name: 'write',
      state: 'completed',
      detail: 'done',
    });
    expect(result.kind === 'tool' ? result.output : '').toContain('"text":"done"');
  });

  it('reports a failed result and keeps the error identity in the output', () => {
    const rig = new ReducerRig();
    rig.open();
    rig.event('tool/call', 3, { data: { callId: 'c1', name: 'bash', arguments: '{}' } });

    const result = only(
      rig.event('tool/result', 4, {
        surfaceOp: 'append',
        data: {
          message: { toolCallId: 'c1', isError: true, content: [{ type: 'text', text: 'boom' }] },
          error: { name: 'Failure', code: 'EXIT' },
        },
      }),
    );

    expect(result).toMatchObject({ kind: 'tool', state: 'failed', detail: 'boom' });
    expect(result.kind === 'tool' ? result.output : '').toContain('"code":"EXIT"');
  });

  it('shortens a long summary but keeps the full result in the output', () => {
    const rig = new ReducerRig();
    rig.open();
    rig.event('tool/call', 3, { data: { callId: 'c1', name: 'read', arguments: '{}' } });
    const text = 'x'.repeat(20_000);

    const result = only(
      rig.event('tool/result', 4, {
        surfaceOp: 'append',
        data: { message: { toolCallId: 'c1', content: [{ type: 'text', text }] } },
      }),
    );

    expect(result.kind === 'tool' ? (result.detail?.length ?? 0) : 0).toBeLessThanOrEqual(16_000);
    expect(result.kind === 'tool' ? result.output : '').toContain(text);
  });

  it('refuses a result whose call it never saw', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(() =>
      rig.event('tool/result', 4, {
        surfaceOp: 'append',
        data: { message: { toolCallId: 'ghost', content: [] } },
      }),
    ).toThrow(/original retained call identity/u);
  });

  it('remembers calls that history left unanswered, and only those', () => {
    const rig = new ReducerRig();
    rig.history.push(
      { type: 'tool/call', seq: 0, data: { callId: 'old', name: 'read', arguments: '{}' } },
      { type: 'tool/call', seq: 1, data: { callId: 'open', name: 'bash', arguments: '{}' } },
      {
        type: 'tool/result',
        seq: 2,
        surfaceOp: 'append',
        data: { message: { toolCallId: 'old', content: [] } },
      },
    );
    rig.open();

    const result = only(
      rig.event('tool/result', 3, {
        surfaceOp: 'append',
        data: { message: { toolCallId: 'open', content: [] } },
      }),
    );

    expect(result).toMatchObject({ name: 'bash', state: 'completed' });
    expect(() =>
      rig.event('tool/result', 4, {
        surfaceOp: 'append',
        data: { message: { toolCallId: 'old', content: [] } },
      }),
    ).toThrow(/original retained call identity/u);
  });
});
