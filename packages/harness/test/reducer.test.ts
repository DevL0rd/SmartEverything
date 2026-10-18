import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ReducerRig, states, USAGE_STREAM, only, stateOf } from './support/reducer-rig';

describe('opening a chat', () => {
  it('announces it as idle with the context its history already measured', () => {
    const rig = new ReducerRig();
    rig.history.push(
      {
        type: 'request/context',
        seq: 0,
        data: { provider: 'route', model: 'scripted-model', contextWindow: 200_000 },
      },
      { type: 'assistant/message', seq: 1, surfaceOp: 'append', data: { stream: USAGE_STREAM } },
    );

    const opened = stateOf(rig.open());

    expect(opened.seq).toBe(0);
    expect(opened.context_update).toBe('restored');
    expect(opened.session.state).toBe('idle');
    expect(opened.session.context).toMatchObject({
      model: 'scripted-model',
      capacity_tokens: 200_000,
      input_tokens: 40,
      state: 'measured',
    });
  });

  it('does not report a turn that history left unfinished as a live one', () => {
    const rig = new ReducerRig();
    rig.history.push({ type: 'turn/start', seq: 0, data: { turn: 1 } });
    rig.open();

    expect(
      rig.event('turn/end', 1, { data: { turn: 1, reason: { kind: 'completed' } } }),
    ).toStrictEqual([]);
  });

  it('drops the volatile fields of the stored projection', () => {
    const rig = new ReducerRig();

    const opened = stateOf(rig.open());

    expect(opened.session).toMatchObject({
      state: 'idle',
      interactions: [],
      work: [],
      failure: null,
    });
  });

  it('numbers events from zero for each session', () => {
    const first = new ReducerRig();
    const second = new ReducerRig();
    first.open();
    first.send({ kind: 'text', delta: 'a' });

    expect(second.open().map((event) => event.seq)).toStrictEqual([0]);
    expect(first.send({ kind: 'text', delta: 'b' }).map((event) => event.seq)).toStrictEqual([2]);
  });
});

describe('frames of sessions that are not open', () => {
  it('produce nothing before the chat is opened', () => {
    const rig = new ReducerRig();

    expect(rig.send({ kind: 'text', delta: 'early' })).toStrictEqual([]);
  });

  it('produce nothing once the chat was closed', () => {
    const rig = new ReducerRig();
    rig.open();
    expect(rig.send({ kind: 'close' })).toStrictEqual([]);

    expect(rig.send({ kind: 'text', delta: 'late' })).toStrictEqual([]);
  });
});

describe('frames of another writer epoch', () => {
  it('are ignored while the chat is open at a different epoch', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(rig.send({ kind: 'text', delta: 'stale', epoch: 2 })).toStrictEqual([]);
  });

  it('cannot close a chat that was opened again at a later epoch', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(rig.send({ kind: 'close', epoch: 2 })).toStrictEqual([]);

    expect(rig.send({ kind: 'text', delta: 'still open' })).toHaveLength(1);
  });

  it('start the chat afresh when it is opened again', () => {
    const rig = new ReducerRig();
    rig.open();
    rig.send({ kind: 'status', status: 'running', work: [] });

    const reopened = stateOf(rig.open());

    expect(reopened).toMatchObject({ seq: 0, session: { state: 'idle' } });
  });
});

describe('the session state', () => {
  it('flags reconnecting without any provider wording and clears it when the provider starts again', () => {
    const rig = new ReducerRig();
    rig.open();

    const retrying = stateOf(
      rig.event('llm/retry', 3, { data: { failure: { code: 'RATE_LIMIT' } } }),
    );
    const odd = stateOf(rig.event('llm/retry', 4, { data: { failure: { code: 'ODD' } } }));
    const resumed = stateOf(rig.event('llm/retry-started', 5));

    expect(retrying.session.reconnecting).toBe(true);
    expect(retrying.session).not.toHaveProperty('retry_note');
    expect(odd.session).not.toHaveProperty('retry_note');
    expect(resumed.session.reconnecting).toBe(false);
  });

  it('follows the working directory', () => {
    const rig = new ReducerRig();
    rig.open();

    const moved = stateOf(rig.event('working-directory/change', 3, { data: { cwd: '/work/app' } }));

    expect(moved.session.directory).toStrictEqual({
      target: { kind: 'server' },
      path: '/work/app',
    });
  });

  it.each([
    ['running', [], 'working'],
    ['idle', [{ kind: 'shell', id: 's', reason: 'A shell is open.' }], 'waiting'],
    ['idle', [], 'idle'],
  ] as const)('maps a %s machine with work %j to %s', (status, work, state) => {
    const rig = new ReducerRig();
    rig.open();

    const reported = stateOf(rig.send({ kind: 'status', status, work }));

    expect(reported.session.state).toBe(state);
    expect(reported.session.work).toStrictEqual(work);
  });

  it('clears the reconnecting flag when the machine goes idle', () => {
    const rig = new ReducerRig();
    rig.open();
    rig.event('llm/retry', 3, { data: { failure: { code: 'TIMEOUT' } } });

    const idle = stateOf(rig.send({ kind: 'status', status: 'idle', work: [] }));

    expect(idle.session.reconnecting).toBe(false);
  });

  it('reports the command revision', () => {
    const rig = new ReducerRig();
    rig.open();
    const revision = 'a'.repeat(64);

    expect(stateOf(rig.send({ kind: 'commands', revision })).session.commands_revision).toBe(
      revision,
    );
  });

  it('reports a failure of the machine', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(only(rig.send({ kind: 'error', message: 'x'.repeat(3000) }))).toMatchObject({
      kind: 'failed',
      failure: { code: 'operation_failed', retry_at: null },
    });
  });

  it('shows the project storage once the machine bound one', () => {
    const rig = new ReducerRig();
    rig.open();
    const binding = { kind: 'managed', chat_id: rig.chatId } as const;

    expect(rig.send({ kind: 'workspace', storage_binding: binding })).toStrictEqual([]);

    expect(
      stateOf(rig.send({ kind: 'status', status: 'idle', work: [] })).session.storage_binding,
    ).toStrictEqual(binding);
  });

  it('reports a confirmed permission change with its operation', () => {
    const rig = new ReducerRig();
    rig.open();
    const operation = randomUUID();
    const permission = { sandbox: 'read-only', approval: 'on-request' } as const;

    const changed = stateOf(rig.send({ kind: 'permission', operation_id: operation, permission }));

    expect(changed.permission_operation_id).toBe(operation);
    expect(changed.session.permission).toStrictEqual(permission);
  });

  it('streams text, reasoning and the state of each model attempt', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(only(rig.send({ kind: 'text', delta: 'a' }))).toMatchObject({
      kind: 'text',
      delta: 'a',
    });
    expect(only(rig.send({ kind: 'reasoning', delta: 'b' }))).toMatchObject({
      kind: 'reasoning',
      delta: 'b',
    });
    expect(
      stateOf(rig.send({ kind: 'attempt', id: 'attempt:1', state: 'started' })).assistant_attempt,
    ).toStrictEqual({ id: 'attempt:1', state: 'started' });
  });
});

describe('pending questions and approvals', () => {
  it('announces a new request and carries every pending one on later states', () => {
    const rig = new ReducerRig();
    rig.open();
    const first = { id: 'q1', epoch: 3, kind: 'question', request: { questions: [] } } as const;
    const second = { id: 'q2', epoch: 3, kind: 'permission', request: {} } as const;

    const added = only(rig.send({ kind: 'interactions', interactions: [first], added: first }));
    only(rig.send({ kind: 'interactions', interactions: [first, second], added: second }));
    const status = stateOf(rig.send({ kind: 'status', status: 'running', work: [] }));

    expect(added).toMatchObject({ kind: 'interaction', interaction: first });
    expect(status.session.interactions).toStrictEqual([first, second]);
  });

  it('publishes the remaining requests as state once one was answered', () => {
    const rig = new ReducerRig();
    rig.open();
    const remaining = { id: 'q2', epoch: 3, kind: 'permission', request: {} } as const;

    const answered = stateOf(
      rig.send({ kind: 'interactions', interactions: [remaining], added: null }),
    );

    expect(answered.session.interactions).toStrictEqual([remaining]);
  });
});

describe('context', () => {
  it('measures the context from a usage report and reports its pressure', () => {
    const rig = new ReducerRig();
    rig.history.push({
      type: 'request/context',
      seq: 0,
      data: { provider: 'route', model: 'm', contextWindow: 1000 },
    });
    rig.open();

    const [measured, usage] = rig.send({
      kind: 'usage',
      usage: { inputTokens: 100, outputTokens: 7, cacheReadTokens: 50, reasoningTokens: 2 },
    });

    expect(measured).toMatchObject({
      kind: 'state',
      context_update: 'measured',
      session: { context: { input_tokens: 150, state: 'measured' } },
    });
    expect(usage).toMatchObject({
      kind: 'usage',
      usage: {
        input_tokens: 150,
        output_tokens: 7,
        total_tokens: null,
        cache_read_tokens: 50,
        cache_write_tokens: null,
        reasoning_tokens: 2,
        cost_usd: null,
      },
      context_percent: 15,
    });
  });

  it('marks the context changed from an estimate and measured when a reply settled', () => {
    const rig = new ReducerRig();
    rig.open();

    const estimated = stateOf(rig.send({ kind: 'context', estimate: 321 }));
    const settled = stateOf(
      rig.event('assistant/message', 3, { surfaceOp: 'append', data: { stream: USAGE_STREAM } }),
    );

    expect(estimated).toMatchObject({
      context_update: 'changed',
      session: { context: { estimate_tokens: 321, state: 'stale' } },
    });
    expect(settled).toMatchObject({
      context_update: 'measured',
      session: { context: { input_tokens: 40, state: 'measured' } },
    });
  });

  it('marks the context compacting between compaction events', () => {
    const rig = new ReducerRig();
    rig.open();

    const started = stateOf(rig.event('compaction/start', 3));
    const ended = stateOf(rig.event('compaction/end', 4));

    expect(started.session.context?.state).toBe('compacting');
    expect(ended.session.context?.state).toBe('unmeasured');
  });

  it('leaves the session state to the machine when a command or compaction finished', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(rig.event('command/done', 3)).toStrictEqual([]);
  });

  it('stales the context when a surface message was replaced and ignores the replacement itself', () => {
    const rig = new ReducerRig();
    rig.open();
    rig.send({ kind: 'usage', usage: { inputTokens: 10, outputTokens: 1 } });

    const replaced = rig.event('assistant/message', 5, {
      surfaceOp: { op: 'replace', startSeq: 0, endSeq: 1 },
      data: { stream: [] },
    });

    expect(states(replaced).map((event) => event.session.context?.state)).toStrictEqual(['stale']);
  });

  it('takes the copies a history edit writes as history, not as new activity', () => {
    const rig = new ReducerRig();
    rig.open();
    rig.event('tool/call', 0, { data: { callId: 'c1', name: 'view', arguments: '{}' } });
    rig.event('tool/result', 1, {
      data: { message: { toolCallId: 'c1', content: [{ type: 'text', text: 'ok' }] } },
    });
    rig.event('system/message', 2, { surfaceOp: { op: 'replace', startSeq: 0, endSeq: 1 } });
    const copy = { surfaceOp: 'append', historyReplay: true };

    const copied = [
      rig.event('tool/result', 3, {
        surfaceOp: 'append',
        data: {
          ...copy,
          message: { toolCallId: 'c1', content: [{ type: 'text', text: 'ok' }] },
        },
      }),
      rig.event('assistant/message', 4, {
        surfaceOp: 'append',
        data: { ...copy, stream: USAGE_STREAM },
      }),
    ].flat();

    expect(copied.filter((event) => event.kind === 'tool')).toStrictEqual([]);
    expect(
      copied.flatMap((event) => (event.kind === 'state' ? [event.session.context?.state] : [])),
    ).not.toContain('measured');
    expect(
      stateOf(rig.send({ kind: 'status', status: 'idle', work: [] })).session.context?.state,
    ).toBe('stale');
  });

  it('does not move an event that is not part of the log vocabulary', () => {
    const rig = new ReducerRig();
    rig.open();

    expect(rig.event('plugin:other/annotation', 3)).toStrictEqual([]);
  });
});
