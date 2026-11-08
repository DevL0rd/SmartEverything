import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session';
import { DSH_SESSION_EVENTS_WRITE } from '@smarteverything/domain';
import type { DshSessionEvent, DshWriterClaim } from '@smarteverything/domain';
import { LocalHarnessPersistence } from '../../../src/harness/local-persistence';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { watchNativeSessions } from '../../../src/assistant/engines/dsh/children';
import { addMessage } from './support/native-conversation';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

const NOW = '2026-10-25T05:00:00.000Z';

type Draft = Omit<DshSessionEvent, 'seq' | 'time'>;

function turnStart(turn: number): Draft {
  return { type: 'turn/start', data: { turn } };
}

function turnEnd(turn: number): Draft {
  return { type: 'turn/end', data: { turn, reason: { kind: 'completed' } } };
}

function user(id: string, text: readonly string[], source: Record<string, string>): Draft {
  return {
    type: 'user/message',
    surfaceOp: 'append',
    data: { id, role: 'user', source, content: text.map((line) => ({ type: 'text', text: line })) },
  };
}

function assistant(
  turn: number,
  text: string,
  id: string = randomUUID(),
  reasoning?: string,
): Draft {
  return {
    type: 'assistant/message',
    surfaceOp: 'append',
    data: {
      turn,
      step: 1,
      stream: [],
      message: {
        id,
        role: 'assistant',
        source: { kind: 'model', provider: 'scripted', model: 'model-a' },
        content: [
          ...(reasoning === undefined ? [] : [{ type: 'reasoning', text: reasoning }]),
          { type: 'text', text },
        ],
      },
    },
  };
}

function toolCall(turn: number, callId: string, name: string): Draft[] {
  return [
    {
      type: 'tool/call',
      data: { turn, step: 1, callId, name, arguments: '{}' },
    },
    {
      type: 'tool/result',
      surfaceOp: 'append',
      data: {
        turn,
        step: 1,
        message: {
          id: randomUUID(),
          role: 'tool',
          source: { kind: 'tool', callId },
          toolCallId: callId,
          content: [{ type: 'text', text: 'ok' }],
        },
      },
    },
  ];
}

interface Writer {
  readonly append: (events: readonly Draft[]) => void;
}

function writer(claim: DshWriterClaim): Writer {
  const { store } = rig.opened;
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  return {
    append: (events): void => {
      const next = store.dshSessions.stat(claim.session_id, rig.owner.profileId)?.next_seq ?? 0;
      store.dshSessions.append(
        {
          claim,
          operation_id: randomUUID(),
          events: DSH_SESSION_EVENTS_WRITE.parse(
            events.map((entry, index) => ({ ...entry, seq: next + index, time: 1_000 + next })),
          ),
        },
        principal,
      );
    },
  };
}

function rows(chatId: string): readonly (readonly [string, string, readonly string[]])[] {
  return rig.opened.store.assistantChat
    .messages({ chatId, limit: 50 })
    .toReversed()
    .map((row) => [row.role, row.text, row.steps] as const);
}

function parentChat(): {
  readonly chatId: string;
  readonly claim: DshWriterClaim;
  readonly delivery: string;
} {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const question = addMessage(rig, chat.id, { role: 'person', text: 'Check the lights' });
  const reply = addMessage(rig, chat.id, { role: 'responder', text: 'Asked a helper.' });
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: question.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: 'Check the lights',
  });
  store.harnessDeliveries.admit(event.id, open.claim.session_id, () => reply.id);
  const delivery = store.harnessDeliveries.pending(open.claim.session_id)[0]?.delivery_id;
  if (delivery === undefined) throw new Error('No delivery was admitted.');
  return { chatId: chat.id, claim: open.claim, delivery };
}

describe('the chat messages of a native conversation', () => {
  it('keeps every auto-started reply once, in order, and leaves hub turns to the live reply', () => {
    const { store } = rig.opened;
    watchNativeSessions(store, new ConversationLog(store), () => new Date(NOW));
    const parent = parentChat();
    const session = writer(parent.claim);
    const closing = randomUUID();

    session.append([
      turnStart(1),
      user(parent.delivery, ['Check the lights'], { kind: 'user' }),
      assistant(1, 'Asked a helper.'),
      turnEnd(1),
    ]);
    session.append([
      turnStart(2),
      user(randomUUID(), ['The helper finished.'], { kind: 'subagent-settled', form: 'notice' }),
    ]);
    session.append([...toolCall(2, 'c1', 'home_read'), assistant(2, 'It finished: done.')]);
    session.append([turnEnd(2), turnStart(3), assistant(3, 'Both helpers are in.', closing)]);
    session.append([assistant(3, 'Both helpers are in.', closing), turnEnd(3)]);

    expect(rows(parent.chatId)).toStrictEqual([
      ['person', 'Check the lights', []],
      ['responder', 'Asked a helper.', []],
      ['responder', 'It finished: done.', ['home_read']],
      ['responder', 'Both helpers are in.', []],
    ]);
  });

  it('shows a helper the message its parent sent and the answer it gave to it', async () => {
    const { store } = rig.opened;
    watchNativeSessions(store, new ConversationLog(store), () => new Date(NOW));
    const parent = parentChat();
    const persistence = new LocalHarnessPersistence(rig.service);
    persistence.bind(parent.claim);
    const child = await persistence.create(
      {
        version: SESSION_FORMAT_VERSION,
        id: SessionId(randomUUID()),
        createdAt: Date.now(),
        cwd: '/tmp/work',
        isSeeded: false,
        parentSession: SessionId(parent.claim.session_id),
        origin: 'subagent',
        delegationDepth: 1,
      },
      0,
    );
    const session = writer(child.claim);
    const run = store.aiAgentRuns.currentOfSession(child.claim.session_id);
    const parentTitle = store.aiChats.chat(parent.chatId).title;

    session.append([
      turnStart(1),
      user(randomUUID(), ['Count the lamps.'], { kind: 'user' }),
      assistant(1, 'Three lamps.'),
      turnEnd(1),
    ]);
    session.append([
      turnStart(2),
      user(randomUUID(), [`Agent ${parent.claim.session_id} sent a message: `, 'And the fans?'], {
        kind: 'agent-message',
        form: 'relay',
        senderSessionId: parent.claim.session_id,
      }),
      ...toolCall(2, 'c2', 'send_message'),
      assistant(2, 'Two fans.'),
      turnEnd(2),
    ]);

    const chatId = run?.child_chat_id ?? '';
    expect(rows(chatId)).toStrictEqual([
      ['person', 'Count the lamps.', []],
      ['responder', 'Three lamps.', []],
      ['person', 'And the fans?', []],
      ['responder', 'Two fans.', ['send_message']],
    ]);
    expect(store.assistantChat.messages({ chatId, limit: 50 })[1]?.author).toBe(parentTitle);
  });

  it('shows the thinking and tools of a reply in the order they happened', () => {
    const { store } = rig.opened;
    watchNativeSessions(store, new ConversationLog(store), () => new Date(NOW));
    const parent = parentChat();
    const session = writer(parent.claim);
    const reply = randomUUID();

    session.append([
      turnStart(1),
      user(randomUUID(), ['Check the fans'], { kind: 'user' }),
      assistant(1, '', randomUUID(), 'Look at the fans first.'),
      ...toolCall(1, 'c3', 'home_read'),
      assistant(1, 'Two fans are on.', reply, 'Both report on.'),
      turnEnd(1),
    ]);

    const row = store.assistantChat.message(reply);
    const timeline = row.embeds.find((embed) => embed.kind === 'chat_timeline');
    expect(timeline).toMatchObject({
      parts: [
        { kind: 'reasoning', text: 'Look at the fans first.' },
        { kind: 'tool', tool: { callId: 'c3', name: 'home_read', state: 'done' } },
        { kind: 'reasoning', text: 'Both report on.' },
        { kind: 'text', text: 'Two fans are on.' },
      ],
    });
    expect(row.steps).toStrictEqual(['home_read']);
  });
});
