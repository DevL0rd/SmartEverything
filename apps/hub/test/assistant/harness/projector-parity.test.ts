import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DSH_SESSION_EVENTS_WRITE,
  CHAT_TIMELINE_EMBED,
  HARNESS_NATIVE_FRAME,
  type AiChatRow,
  type AssistantMessageRow,
  type DshSessionEvent,
  type DshWriterClaim,
  type JsonValue,
} from '@smarteverything/domain';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { ConversationProjector } from '../../../src/assistant/engines/dsh/projector';
import { reconcileNativeReplies } from '../../../src/assistant/engines/dsh/projector-replay';
import type { StoredEvent } from '../../../src/store/repositories/assistant-events';
import { projectorOf } from './support/projector';
import { useRig, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

interface Conversation {
  readonly chat: AiChatRow;
  readonly event: StoredEvent;
  readonly reply: AssistantMessageRow;
  readonly claim: DshWriterClaim;
  readonly sessionId: string;
  readonly append: (events: readonly Omit<DshSessionEvent, 'seq'>[]) => Promise<void>;
  readonly send: (body: Record<string, unknown>) => Promise<void>;
}

async function conversation(): Promise<Conversation> {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  const question = addMessage(rig, chat.id, { role: 'person', text: 'work' });
  const reply = addMessage(rig, chat.id, { role: 'responder', text: '' });
  store.assistantChat.updateMessage(reply.id, { model: 'model-a', state: 'working' });
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: question.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: 'work',
  });
  store.harnessDeliveries.admit(event.id, open.claim.session_id, () => reply.id);
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  return {
    chat: store.aiChats.chat(chat.id),
    event,
    reply,
    claim: open.claim,
    sessionId: open.claim.session_id,
    append: async (events): Promise<void> => {
      const next =
        store.dshSessions.stat(open.claim.session_id, rig.owner.profileId)?.next_seq ?? 0;
      const appended = await store.live.dshSessions.append(
        {
          claim: open.claim,
          operation_id: randomUUID(),
          events: DSH_SESSION_EVENTS_WRITE.parse(
            events.map((entry, index) => ({ ...entry, seq: next + index })),
          ),
        },
        principal,
      );
      store.dshSessions.flush(
        { claim: open.claim, expected_next_seq: appended.next_seq },
        principal,
      );
      await rig.service.ingested();
    },
    send: (body): Promise<void> =>
      rig.service.native(
        HARNESS_NATIVE_FRAME.parse({
          session_id: open.claim.session_id,
          epoch: open.claim.epoch,
          ...body,
        }),
      ),
  };
}

type Entry = Omit<DshSessionEvent, 'seq'>;

function model(content: JsonValue[]): JsonValue {
  return {
    turn: 1,
    step: 0,
    stream: [],
    message: {
      id: randomUUID(),
      role: 'assistant',
      source: { kind: 'model', provider: 'scripted', model: 'model-a' },
      content,
    },
  };
}

function records(delivery: string, ending: JsonValue): Record<string, readonly Entry[]> {
  return {
    claim: [
      {
        type: 'agent/inbox/spliced',
        time: 1,
        ignorable: true,
        data: { target: 'next-turn', start: 0, inserted: [{ id: delivery }] },
      },
      { type: 'turn/start', time: 2, data: { turn: 1 } },
    ],
    prompt: [
      {
        type: 'user/message',
        time: 3,
        surfaceOp: 'append',
        data: {
          id: delivery,
          role: 'user',
          source: { kind: 'user' },
          content: [{ type: 'text', text: 'work' }],
        },
      },
    ],
    first: [
      {
        type: 'assistant/message',
        time: 4,
        surfaceOp: 'append',
        data: model([
          { type: 'reasoning', text: 'Thinking. ' },
          { type: 'text', text: 'Looking. ' },
          { type: 'tool-call', id: 'call-1', name: 'read', arguments: '{"path":"a"}' },
        ]),
      },
      {
        type: 'tool/call',
        time: 5,
        data: { turn: 1, step: 0, callId: 'call-1', name: 'read', arguments: '{"path":"a"}' },
      },
      {
        type: 'tool/result',
        time: 6,
        surfaceOp: 'append',
        data: {
          turn: 1,
          step: 0,
          message: {
            id: randomUUID(),
            role: 'tool',
            source: { kind: 'tool', callId: 'call-1' },
            toolCallId: 'call-1',
            content: [{ type: 'text', text: 'contents of a' }],
          },
        },
      },
    ],
    second: [
      {
        type: 'assistant/message',
        time: 7,
        surfaceOp: 'append',
        data: model([{ type: 'text', text: 'Done.' }]),
      },
    ],
    end: [{ type: 'turn/end', time: 8, data: { turn: 1, reason: ending } }],
  };
}

function shown(live: Conversation, store: Rig['opened']['store']): unknown {
  const row = store.assistantChat.message(live.reply.id);
  const question = store.assistantChat.message(live.event.message_id ?? '');
  return {
    text: row.text,
    state: row.state,
    reason: row.reason,
    reason_code: row.reason_code,
    steps: row.steps,
    step_states: row.step_states,
    timeline: row.embeds.find((embed) => embed.kind === 'chat_timeline'),
    question: { state: question.state, reason: question.reason, reason_code: question.reason_code },
  };
}

async function liveTurn(ending: JsonValue): Promise<unknown> {
  const { store } = rig.opened;
  const live = await conversation();
  const log = records(live.event.id, ending);
  const streams = new ConversationProjector(
    {
      service: rig.service,
      conversation: new ConversationLog(store),
      emit: (): void => undefined,
      finished: (): void => undefined,
    },
    (): Promise<void> => Promise.resolve(),
    (): Promise<void> => Promise.resolve(),
    () => Promise.resolve(),
  );
  const off = rig.service.onEvent(streams.received);
  const done = streams.start(live.event, live.chat, live.reply.id);
  await live.send({ kind: 'open' });
  await live.append(log['claim'] ?? []);
  await live.send({ kind: 'input', message_id: live.event.id, turn: 1 });
  await live.send({ kind: 'status', status: 'running', work: [] });
  await live.append(log['prompt'] ?? []);
  await live.send({ kind: 'attempt', id: 'a:1', state: 'started' });
  await live.send({ kind: 'reasoning', delta: 'Thinking. ' });
  await live.send({ kind: 'text', delta: 'Looking. ' });
  await live.send({ kind: 'attempt', id: 'a:1', state: 'committed' });
  await live.append(log['first'] ?? []);
  await live.send({ kind: 'attempt', id: 'a:2', state: 'started' });
  await live.send({ kind: 'text', delta: 'Done.' });
  await live.send({ kind: 'attempt', id: 'a:2', state: 'committed' });
  await live.append(log['second'] ?? []);
  await live.append(log['end'] ?? []);
  await done;
  off();
  return shown(live, store);
}

async function replayedTurn(ending: JsonValue, withEnd = true): Promise<unknown> {
  const { store } = rig.opened;
  const replayed = await conversation();
  const log = records(replayed.event.id, ending);
  for (const part of ['claim', 'prompt', 'first', 'second']) await replayed.append(log[part] ?? []);
  if (withEnd) await replayed.append(log['end'] ?? []);
  const projector = projectorOf(rig);
  await reconcileNativeReplies(projector);
  await projector.settled();
  return shown(replayed, store);
}

describe('a turn shown live and the same turn rebuilt from the log', () => {
  it('leave the same reply, steps and timeline when it finished', async () => {
    const live = await liveTurn({ kind: 'completed' });
    const replayed = await replayedTurn({ kind: 'completed' });

    expect(replayed).toStrictEqual(live);
    expect(live).toMatchObject({
      text: 'Looking. Done.',
      state: 'answered',
      steps: ['read'],
      step_states: ['done'],
      timeline: {
        parts: [
          { kind: 'reasoning', text: 'Thinking. ' },
          { kind: 'text', text: 'Looking. ' },
          { kind: 'tool', tool: { callId: 'call-1', state: 'done', detail: 'contents of a' } },
          { kind: 'text', text: 'Done.' },
        ],
      },
    });
  });

  it('leave the same stopped reply when the person stopped it', async () => {
    const reason = { kind: 'aborted', reason: { kind: 'user' } };
    const live = await liveTurn(reason);
    const replayed = await replayedTurn(reason);

    expect(replayed).toStrictEqual(live);
    expect(live).toMatchObject({ state: 'failed', reason_code: 'stopped' });
  });
});

describe('a turn rebuilt from the log after the hub stopped', () => {
  it('retains persisted message boundaries through real native-log reconciliation', async () => {
    const { store } = rig.opened;
    const replayed = await conversation();
    const log = records(replayed.event.id, { kind: 'completed' });
    for (const part of ['claim', 'prompt', 'first', 'second', 'end'])
      await replayed.append(log[part] ?? []);
    const user = addMessage(rig, replayed.chat.id, {
      role: 'person',
      text: 'While the tool was running',
    });
    const conversationLog = new ConversationLog(store);
    await conversationLog.timeline(
      replayed.reply.id,
      CHAT_TIMELINE_EMBED.parse({
        kind: 'chat_timeline',
        version: 1,
        parts: [
          { kind: 'reasoning', key: 'reasoning:0', text: 'Thinking. ' },
          { kind: 'text', key: 'text:1', text: 'Looking. ' },
          { kind: 'steer', key: `steer:${user.id}`, message_id: user.id },
        ],
      }),
    );
    const projector = projectorOf(rig);
    await reconcileNativeReplies(projector);
    await projector.settled();
    const row = store.assistantChat.message(replayed.reply.id);
    const timeline = CHAT_TIMELINE_EMBED.parse(
      row.embeds.find((embed) => embed.kind === 'chat_timeline'),
    );
    expect(timeline.parts.map((part) => part.kind)).toEqual([
      'reasoning',
      'text',
      'steer',
      'tool',
      'text',
    ]);
    expect(timeline.parts[2]).toMatchObject({ message_id: user.id });
    expect(timeline.parts[3]).toMatchObject({ tool: { callId: 'call-1', state: 'done' } });
    expect(row.text).toBe('Looking. Done.');
  });

  it('keeps the reason the turn failed with', async () => {
    const replayed = await replayedTurn({ kind: 'error', error: { message: 'No credit left' } });

    expect(replayed).toMatchObject({
      text: 'Looking. Done.',
      state: 'failed',
      reason: 'No credit left',
      question: { state: 'failed', reason: 'No credit left' },
    });
  });

  it('settles a turn with no recorded end as interrupted by the restart', async () => {
    const replayed = await replayedTurn({ kind: 'completed' }, false);

    expect(replayed).toMatchObject({
      state: 'failed',
      reason: 'The hub restarted.',
      reason_code: 'interrupted',
    });
  });
});
