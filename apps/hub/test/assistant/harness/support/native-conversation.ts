import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { foldSurface } from '@deepseek-ai/dsh-session';
import { readNativeHistory } from '@smarteverything/harness/process';
import {
  DSH_SESSION_EVENTS_WRITE,
  DSH_SESSION_ID,
  type AiChatRow,
  type AssistantMessageRow,
  type DshSessionEvent,
  type JsonValue,
} from '@smarteverything/domain';
import type { Rig } from './rig';

export interface Line {
  readonly role: 'person' | 'responder';
  readonly text: string;
}

export interface SeededConversation {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly sessionId: string;
}

export const TWO_EXCHANGES: readonly Line[] = [
  { role: 'person', text: 'first question' },
  { role: 'responder', text: 'first answer' },
  { role: 'person', text: 'second question' },
  { role: 'responder', text: 'second answer' },
];

const LEGACY_MARKER = 'plugin:smarteverything/legacy-message';

type Emit = (type: string, data: JsonValue, extra?: Record<string, JsonValue>) => void;

function rowBody(emit: Emit, row: AssistantMessageRow, turn: number): void {
  if (row.role === 'person') {
    emit(
      'user/message',
      {
        id: row.id,
        role: 'user',
        source: { kind: 'smarteverything-history' },
        content: [{ type: 'text', text: row.text }],
      },
      { surfaceOp: 'append' },
    );
    return;
  }
  emit(
    'assistant/message',
    {
      turn,
      step: 0,
      message: {
        id: `${row.id}:0`,
        role: 'assistant',
        source: { kind: 'model', provider: 'openrouter', model: 'model-a' },
        content: [{ type: 'text', text: row.text }],
      },
      stream: [],
    },
    { surfaceOp: 'append' },
  );
}

function legacyEvents(rows: readonly AssistantMessageRow[]): readonly DshSessionEvent[] {
  const events: DshSessionEvent[] = [];
  const emit: Emit = (type, data, extra = {}) => {
    events.push({ type, seq: events.length, time: 1_000 + events.length, data, ...extra });
  };
  emit(
    'system/message',
    {
      turn: 0,
      step: 0,
      message: {
        id: 'import-system',
        role: 'system',
        source: { kind: 'system-prompt' },
        content: [],
      },
    },
    { surfaceOp: 'append' },
  );
  for (const [turn, row] of rows.entries()) {
    emit(LEGACY_MARKER, { id: row.id }, { ignorable: true });
    emit('turn/start', { turn });
    emit('step/start', { turn, step: 0 });
    rowBody(emit, row, turn);
    emit('step/end', { turn, step: 0 });
    emit('turn/end', { turn, reason: { kind: 'completed' } });
  }
  return DSH_SESSION_EVENTS_WRITE.parse(events);
}

export function seedConversation(
  rig: Rig,
  lines: readonly Line[],
  target: Rig['hub']['target'] = { kind: 'server' },
): SeededConversation {
  const chat = rig.newChat(target);
  const rows = lines.map((line) => addMessage(rig, chat.id, line));
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(target).host,
  );
  const { store } = rig.opened;
  store.dshSessions.append(
    { claim: open.claim, operation_id: randomUUID(), events: legacyEvents(rows) },
    principal,
  );
  return { chat: store.aiChats.chat(chat.id), rows, sessionId: open.claim.session_id };
}

const TEXT_PART = z.object({ type: z.literal('text'), text: z.string() });
const CARRIER = z.union([
  z.object({ content: z.array(z.unknown()) }),
  z.object({ message: z.object({ content: z.array(z.unknown()) }) }),
]);

export function storedHistory(rig: Rig, sessionId: string): ReturnType<typeof readNativeHistory> {
  const { store } = rig.opened;
  const metadata = store.dshSessions.stat(sessionId, rig.owner.profileId);
  if (metadata === undefined) throw new Error('The native session is absent.');
  const events = store.dshSessions.read(
    { session_id: DSH_SESSION_ID.parse(sessionId), offset: 0, limit: 10_000 },
    rig.owner.profileId,
  ).events;
  return readNativeHistory(metadata.header, events);
}

export function visibleTexts(history: ReturnType<typeof readNativeHistory>): readonly string[] {
  return foldSurface(history).nodes.flatMap((seq) => {
    const event = history[seq];
    if (event === undefined || event.type === 'system/message') return [];
    const carrier = CARRIER.parse(event.data);
    const content = 'message' in carrier ? carrier.message.content : carrier.content;
    return content.flatMap((part) => {
      const text = TEXT_PART.safeParse(part);
      return text.success ? [text.data.text] : [];
    });
  });
}

export function turnEnds(history: ReturnType<typeof readNativeHistory>): readonly number[] {
  return history.flatMap((event) => (event.type === 'turn/end' ? [event.seq] : []));
}

export function reread(
  rig: Rig,
  sessionId: string,
  events: readonly unknown[],
): ReturnType<typeof readNativeHistory> {
  const metadata = rig.opened.store.dshSessions.stat(sessionId, rig.owner.profileId);
  if (metadata === undefined) throw new Error('The native session is absent.');
  return readNativeHistory(metadata.header, events);
}

export function addMessage(rig: Rig, chatId: string, line: Line, at?: string): AssistantMessageRow {
  return rig.opened.store.assistantChat.addMessage(
    {
      profile_id: rig.owner.profileId,
      client_id: null,
      role: line.role,
      kind: 'text',
      author: line.role === 'person' ? 'Sam' : 'Coordinator',
      text: line.text,
      attachments: [],
      state: null,
      reason: null,
      steps: [],
      step_states: [],
      reply_to: null,
      chat_id: chatId,
      origin: null,
      embeds: [],
      cost_micros: 0,
      model: null,
    },
    at === undefined ? undefined : { createdAt: at, updatedAt: at },
  );
}

export interface Exchange {
  readonly question: string;
  readonly answer: string;
  readonly confirmed?: boolean;
}

export interface NativeConversation extends SeededConversation {
  readonly deliveries: readonly string[];
}

function exchangeEvents(
  turn: number,
  delivery: string,
  exchange: Exchange,
  base: number,
): readonly DshSessionEvent[] {
  const at = (offset: number): number => 10_000 * turn + offset;
  const events: DshSessionEvent[] = [
    { type: 'turn/start', seq: base, time: at(0), data: { turn } },
    { type: 'step/start', seq: base + 1, time: at(1), data: { turn, step: 0 } },
    {
      type: 'user/message',
      seq: base + 2,
      time: at(2),
      surfaceOp: 'append',
      data: {
        id: delivery,
        role: 'user',
        source: { kind: 'user' },
        content: [{ type: 'text', text: exchange.question }],
      },
    },
    {
      type: 'assistant/message',
      seq: base + 3,
      time: at(3),
      surfaceOp: 'append',
      data: {
        turn,
        step: 0,
        message: {
          id: randomUUID(),
          role: 'assistant',
          source: { kind: 'model', provider: 'scripted', model: 'model-a' },
          content: [{ type: 'text', text: exchange.answer }],
        },
        stream: [],
      },
    },
    { type: 'step/end', seq: base + 4, time: at(4), data: { turn, step: 0 } },
    { type: 'turn/end', seq: base + 5, time: at(5), data: { turn, reason: { kind: 'completed' } } },
  ];
  return events;
}

const SYSTEM_EVENT: DshSessionEvent = {
  type: 'system/message',
  seq: 0,
  time: 1,
  surfaceOp: 'append',
  data: {
    turn: 0,
    step: 0,
    message: { id: 'system', role: 'system', source: { kind: 'system-prompt' }, content: [] },
  },
};

function admitExchange(
  rig: Rig,
  held: { readonly chatId: string; readonly sessionId: string; readonly next: number },
  exchange: Exchange,
  turn: number,
): {
  readonly delivery: string;
  readonly rows: readonly AssistantMessageRow[];
  readonly events: readonly DshSessionEvent[];
} {
  const { store } = rig.opened;
  const delivery = randomUUID();
  const question = addMessage(rig, held.chatId, { role: 'person', text: exchange.question });
  const answer = addMessage(rig, held.chatId, { role: 'responder', text: exchange.answer });
  store.assistantEvents.add({
    id: delivery,
    kind: 'chat',
    chat_id: held.chatId,
    message_id: question.id,
    profile_id: rig.owner.profileId,
    client_id: null,
    text: exchange.question,
  });
  store.harnessDeliveries.admit(delivery, held.sessionId, () => answer.id);
  const events = exchangeEvents(turn, delivery, exchange, held.next);
  store.harnessDeliveries.cut(delivery, held.next, held.next + events.length - 1);
  if (exchange.confirmed !== false)
    store.harnessDeliveries.update(delivery, 'completed', () => undefined);
  return { delivery, rows: [question, answer], events };
}

export function nativeConversation(
  rig: Rig,
  exchanges: readonly Exchange[],
  target: Rig['hub']['target'] = { kind: 'server' },
): NativeConversation {
  const chat = rig.newChat(target);
  const { store } = rig.opened;
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const events: DshSessionEvent[] = [SYSTEM_EVENT];
  const rows: AssistantMessageRow[] = [];
  const deliveries: string[] = [];
  for (const [turn, exchange] of exchanges.entries()) {
    const held = { chatId: chat.id, sessionId: open.claim.session_id, next: events.length };
    const admitted = admitExchange(rig, held, exchange, turn + 1);
    events.push(...admitted.events);
    rows.push(...admitted.rows);
    deliveries.push(admitted.delivery);
  }
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(target).host,
  );
  const written = DSH_SESSION_EVENTS_WRITE.parse(events);
  store.dshSessions.append(
    { claim: open.claim, operation_id: randomUUID(), events: written },
    principal,
  );
  return { chat: store.aiChats.chat(chat.id), rows, sessionId: open.claim.session_id, deliveries };
}
