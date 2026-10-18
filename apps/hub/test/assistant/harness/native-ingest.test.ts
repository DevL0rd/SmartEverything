import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HARNESS_NATIVE_FRAME, HARNESS_PUBLICATION } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessEvent,
  AiHarnessTarget,
  DshSessionEvent,
  DshWriterClaim,
  HarnessTransportRequest,
} from '@smarteverything/domain';
import { acceptPublication } from '../../../src/harness/native-publication';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

interface Opened {
  readonly chat: AiChatRow;
  readonly sessionId: string;
  readonly epoch: number;
  readonly seen: AiHarnessEvent[];
  readonly claimed: DshWriterClaim;
  readonly send: (body: Record<string, unknown>) => void;
  readonly log: (events: readonly DshSessionEvent[]) => void;
}

async function open(target: AiHarnessTarget = rig.hub.target): Promise<Opened> {
  const chat = rig.newChat(target);
  const request = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(target, randomUUID(), request);
  const sessionId = request.claim.session_id;
  const seen: AiHarnessEvent[] = [];
  rig.service.onEvent((event) => seen.push(event));
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(target).host,
  );
  return {
    chat: rig.opened.store.aiChats.chat(chat.id),
    sessionId,
    epoch: request.claim.epoch,
    seen,
    claimed: request.claim,
    send: (body): void => {
      rig.service.native(
        HARNESS_NATIVE_FRAME.parse({ session_id: sessionId, epoch: request.claim.epoch, ...body }),
      );
    },
    log: (events): void => {
      const stat = rig.opened.store.dshSessions.stat(sessionId, rig.owner.profileId);
      const appended = rig.opened.store.dshSessions.append(
        {
          claim: request.claim,
          operation_id: randomUUID(),
          events: events.map((event, index) => ({ ...event, seq: (stat?.next_seq ?? 0) + index })),
        },
        principal,
      );
      rig.opened.store.dshSessions.flush(
        { claim: request.claim, expected_next_seq: appended.next_seq },
        principal,
      );
    },
  };
}

function claim(id: string): DshSessionEvent {
  return {
    type: 'agent/inbox/spliced',
    seq: 0,
    time: 1,
    ignorable: true,
    data: { target: 'next-turn', start: 0, inserted: [{ id }] },
  };
}

function turnStart(turn: number): DshSessionEvent {
  return { type: 'turn/start', seq: 0, time: 1, data: { turn } };
}

function turnEnd(turn: number, kind: 'completed' | 'blocked'): DshSessionEvent {
  return { type: 'turn/end', seq: 0, time: 1, data: { turn, reason: { kind } } };
}

function assistantReply(): DshSessionEvent {
  return {
    type: 'assistant/message',
    seq: 0,
    time: 1,
    surfaceOp: 'append',
    data: {
      turn: 0,
      step: 0,
      message: {
        id: randomUUID(),
        role: 'assistant',
        source: { kind: 'model', provider: 'p', model: 'm' },
        content: [{ type: 'text', text: 'hello' }],
      },
      stream: [
        {
          type: 'chunk',
          time: 1,
          chunk: { type: 'usage', usage: { inputTokens: 90, outputTokens: 3 } },
        },
      ],
    },
  };
}

describe('native frames reaching the hub', () => {
  it('announce an opened chat as idle', async () => {
    const opened = await open();

    opened.send({ kind: 'open' });

    expect(opened.seen).toMatchObject([
      { kind: 'state', seq: 0, context_update: 'restored', session: { state: 'idle' } },
    ]);
    expect(rig.service.state(rig.owner, opened.chat.id).state).toBe('idle');
  });

  it('measure the context from the log the hub stored', async () => {
    const opened = await open();
    opened.log([
      {
        type: 'request/context',
        seq: 0,
        time: 1,
        ignorable: true,
        data: { provider: 'route', model: 'model-a' },
      },
      assistantReply(),
    ]);

    opened.send({ kind: 'open' });

    expect(rig.service.state(rig.owner, opened.chat.id).context).toMatchObject({
      model: 'model-a',
      input_tokens: 90,
      state: 'measured',
    });
  });

  it('move the stored state with the machine status', async () => {
    const opened = await open();
    opened.send({ kind: 'open' });

    opened.send({ kind: 'status', status: 'running', work: [] });
    expect(rig.service.state(rig.owner, opened.chat.id).state).toBe('working');

    const work = [{ kind: 'shell', id: 's1', reason: 'A shell is open.' }];
    opened.send({ kind: 'status', status: 'idle', work });
    const waiting = rig.service.state(rig.owner, opened.chat.id);

    expect(waiting.state).toBe('waiting');
    expect(waiting.work).toStrictEqual(work);
  });

  it('complete a claimed delivery with the position the hub stored', async () => {
    const opened = await open();
    opened.send({ kind: 'open' });
    const delivery = randomUUID();

    opened.log([claim(delivery), turnStart(1)]);
    opened.send({ kind: 'input', message_id: delivery, turn: 1 });
    opened.log([turnEnd(1, 'completed')]);

    const stored = rig.opened.store.dshSessions.stat(opened.sessionId, rig.owner.profileId);
    expect(opened.seen.at(-1)).toMatchObject({
      kind: 'completed',
      delivery_id: delivery,
      native_turn: 1,
      interrupted: false,
      durable_seq: stored?.durable_seq,
    });
    expect(stored?.durable_seq).toBeGreaterThanOrEqual(2);
  });

  it('replay a whole turn into the stored state and the events the chat follows', async () => {
    const opened = await open();
    const delivery = randomUUID();
    opened.send({ kind: 'open' });

    opened.log([claim(delivery), turnStart(1)]);
    opened.send({ kind: 'input', message_id: delivery, turn: 1 });
    opened.send({ kind: 'status', status: 'running', work: [] });
    opened.send({ kind: 'attempt', id: 'a:1', state: 'started' });
    opened.send({ kind: 'text', delta: 'Hel' });
    opened.send({ kind: 'text', delta: 'lo' });
    opened.send({ kind: 'usage', usage: { inputTokens: 12, outputTokens: 2 } });
    opened.send({ kind: 'attempt', id: 'a:1', state: 'committed' });
    opened.log([turnEnd(1, 'completed')]);
    opened.send({ kind: 'status', status: 'idle', work: [] });

    const delivered = opened.seen.filter((event) => event.delivery_id === delivery);
    expect(opened.seen.map((event) => event.seq)).toStrictEqual(
      opened.seen.map((_event, index) => index),
    );
    expect(opened.seen.map((event) => event.kind)).toStrictEqual([
      'state',
      'state',
      'state',
      'state',
      'text',
      'text',
      'state',
      'usage',
      'state',
      'completed',
      'state',
    ]);
    expect(delivered.map((event) => event.kind)).toContain('completed');
    expect(
      opened.seen.filter((event) => event.kind === 'text').map((event) => event.delta),
    ).toStrictEqual(['Hel', 'lo']);
    const final = rig.service.state(rig.owner, opened.chat.id);
    expect(final).toMatchObject({ state: 'idle', context: { input_tokens: 12 } });
  });

  it('end a turn from the log alone when no frame follows it', async () => {
    const opened = await open();
    const delivery = randomUUID();
    opened.send({ kind: 'open' });
    opened.log([claim(delivery), turnStart(1)]);
    opened.send({ kind: 'input', message_id: delivery, turn: 1 });
    opened.send({ kind: 'status', status: 'running', work: [] });

    opened.log([turnEnd(1, 'completed')]);

    expect(opened.seen.at(-1)).toMatchObject({ kind: 'completed', delivery_id: delivery });
    expect(rig.service.state(rig.owner, opened.chat.id).state).toBe('idle');
  });

  it('fail a turn the log says was blocked', async () => {
    const opened = await open();
    const delivery = randomUUID();
    opened.send({ kind: 'open' });
    opened.log([claim(delivery), turnStart(1)]);
    opened.send({ kind: 'input', message_id: delivery, turn: 1 });

    opened.log([turnEnd(1, 'blocked')]);

    expect(opened.seen.at(-1)).toMatchObject({
      kind: 'failed',
      failure: { message: 'The turn was blocked.' },
    });
  });

  it('reduce an event once however often its append is repeated', async () => {
    const opened = await open();
    const delivery = randomUUID();
    opened.send({ kind: 'open' });
    opened.log([claim(delivery), turnStart(1)]);
    opened.send({ kind: 'input', message_id: delivery, turn: 1 });
    const stat = rig.opened.store.dshSessions.stat(opened.sessionId, rig.owner.profileId);
    const append = {
      claim: opened.claimed,
      operation_id: randomUUID(),
      events: [{ ...turnEnd(1, 'completed'), seq: stat?.next_seq ?? 0 }],
    };
    const principal = rig.service.hostPrincipal(
      rig.owner.profileId,
      rig.service.directory.get(rig.hub.target).host,
    );

    rig.opened.store.dshSessions.append(append, principal);
    rig.opened.store.dshSessions.append(append, principal);

    expect(opened.seen.filter((event) => event.kind === 'completed')).toHaveLength(1);
  });

  it('are ignored for a chat that was never opened', async () => {
    const opened = await open();

    opened.send({ kind: 'text', delta: 'early' });

    expect(opened.seen).toStrictEqual([]);
  });

  it('carry streamed text to every listener', async () => {
    const opened = await open();
    opened.send({ kind: 'open' });

    opened.send({ kind: 'text', delta: 'chunk' });

    expect(opened.seen.at(-1)).toMatchObject({ kind: 'text', delta: 'chunk' });
  });
});

describe('a publication from a machine', () => {
  async function publication(frame: Record<string, unknown>): Promise<HarnessTransportRequest> {
    const target = rig.desk.target;
    if (target.kind !== 'device') throw new Error('The desk is a computer.');
    const opened = await open(target);
    const host = rig.service.directory.get(target).host;
    return {
      device_id: target.device_id,
      generation: host.connection_generation,
      runtime_instance: host.runtime_instance,
      request: {
        operation: 'publish',
        frame: HARNESS_PUBLICATION.parse({
          device_id: target.device_id,
          generation: host.connection_generation,
          runtime_instance: host.runtime_instance,
          type: 'harness_native',
          frame: { session_id: opened.sessionId, epoch: opened.epoch, ...frame },
        }),
      },
    };
  }

  it('is reduced when it belongs to the granted host and the current writer epoch', async () => {
    const request = await publication({ kind: 'open' });

    expect(acceptPublication(rig.service, request)).toStrictEqual({ ok: true });
  });

  it('is refused when it names another writer epoch', async () => {
    const request = await publication({ kind: 'open' });
    const frame = request.request.operation === 'publish' ? request.request.frame : undefined;
    if (frame?.type !== 'harness_native') throw new Error('Expected a native publication.');

    expect(() =>
      acceptPublication(rig.service, {
        ...request,
        request: {
          operation: 'publish',
          frame: { ...frame, frame: { ...frame.frame, epoch: frame.frame.epoch + 1 } },
        },
      }),
    ).toThrow(/writer epoch/u);
  });

  it('is refused from a runtime that is not the granted host', async () => {
    const request = await publication({ kind: 'open' });

    expect(() => acceptPublication(rig.service, { ...request, generation: randomUUID() })).toThrow(
      /replaced|granted/u,
    );
  });

  it('refuses a request that is not a publication', () => {
    expect(() =>
      acceptPublication(rig.service, {
        device_id: randomUUID(),
        generation: randomUUID(),
        runtime_instance: randomUUID(),
        request: { operation: 'tools' },
      }),
    ).toThrow(/native publication/u);
  });
});
