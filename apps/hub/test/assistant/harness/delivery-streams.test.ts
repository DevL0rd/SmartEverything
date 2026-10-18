import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CHAT_RECONNECTING_REASON,
  type AiChatRow,
  type AiHarnessEvent,
} from '@smarteverything/domain';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import {
  NativeDeliveryStreams,
  type ActiveTurn,
} from '../../../src/assistant/engines/dsh/delivery-streams';
import type { StoredEvent } from '../../../src/store/repositories/assistant-events';
import { useRig, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';
import { captureLogs } from '../../support/logs';

let rig: Rig;
useRig((made) => {
  rig = made;
});

interface Fixture {
  readonly streams: NativeDeliveryStreams;
  readonly deliver: (event: AiHarnessEvent) => void;
  readonly turn: ActiveTurn;
  readonly chat: AiChatRow;
  readonly finished: { readonly id: string; readonly ok: boolean }[];
  readonly toolsFinished: string[];
  readonly event: (kind: 'completed' | 'tool', seq: number) => AiHarnessEvent;
  readonly text: (seq: number, delta: string) => AiHarnessEvent;
  readonly continued: (kind: 'state' | 'completed', seq: number, id: string) => AiHarnessEvent;
  readonly addSteered: () => StoredEvent;
}

async function startedTurn(): Promise<Fixture> {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  const current = store.aiChats.chat(chat.id);
  const conversation = new ConversationLog(store);
  const finished: { id: string; ok: boolean }[] = [];
  const toolsFinished: string[] = [];
  const streams = new NativeDeliveryStreams(
    {
      service: rig.service,
      conversation,
      emit: (): void => undefined,
      finished: (event, _text, ok): void => {
        finished.push({ id: event.id, ok });
      },
    },
    (): void => undefined,
    (turn): void => {
      toolsFinished.push(turn.event.id);
    },
  );
  const question = addMessage(rig, chat.id, { role: 'person', text: 'work' });
  const reply = addMessage(rig, chat.id, { role: 'responder', text: '' });
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
  void streams.start(event, current, reply.id);
  const turn = streams.active.get(event.id);
  if (turn === undefined) throw new Error('The turn did not start.');
  const base = {
    session_id: open.claim.session_id,
    chat_id: chat.id,
    epoch: open.claim.epoch,
    delivery_id: event.id,
    native_turn: 1,
  };
  const deliver = (incoming: AiHarnessEvent): void => {
    streams.received(incoming);
  };
  deliver({
    ...base,
    seq: 0,
    kind: 'state',
    session: rig.service.state(rig.owner, chat.id),
  });
  return {
    streams,
    deliver,
    turn,
    chat: current,
    finished,
    toolsFinished,
    event: (kind, seq): AiHarnessEvent =>
      kind === 'completed'
        ? { ...base, seq, kind: 'completed', durable_seq: 3, interrupted: true }
        : {
            ...base,
            seq,
            kind: 'tool',
            call_id: `call-${String(seq)}`,
            name: 'bash',
            state: seq % 2 === 0 ? 'completed' : 'running',
            target: rig.hub.target,
            detail: null,
          },
    text: (seq, delta): AiHarnessEvent => ({ ...base, seq, kind: 'text', delta }),
    continued: (kind, seq, id): AiHarnessEvent =>
      kind === 'state'
        ? {
            ...base,
            delivery_id: id,
            native_turn: 2,
            seq,
            kind,
            session: rig.service.state(rig.owner, chat.id),
          }
        : {
            ...base,
            delivery_id: id,
            native_turn: 2,
            seq,
            kind,
            durable_seq: 9,
            interrupted: false,
          },
    addSteered: (): StoredEvent => {
      const message = addMessage(rig, chat.id, { role: 'person', text: 'also this' });
      return store.assistantEvents.add({
        id: randomUUID(),
        kind: 'chat',
        chat_id: chat.id,
        message_id: message.id,
        profile_id: rig.owner.profileId,
        client_id: null,
        text: 'also this',
      });
    },
  };
}

describe('a turn that is moving to another machine', () => {
  it('ignores the old machine ending its work while held, and ends normally after release', async () => {
    const mine = await startedTurn();
    mine.deliver(mine.event('tool', 1));
    mine.streams.hold(mine.turn);

    mine.deliver(mine.event('completed', 2));
    expect(mine.streams.active.has(mine.turn.event.id)).toBe(true);

    mine.streams.release(mine.turn);
    mine.deliver(mine.event('completed', 3));
    expect(mine.streams.active.has(mine.turn.event.id)).toBe(false);
  });

  it('follows the work the new machine carries on under its new delivery id', async () => {
    const mine = await startedTurn();
    mine.streams.hold(mine.turn);
    mine.deliver(mine.event('completed', 2));
    const carried = randomUUID();
    mine.streams.continueAs(mine.turn, carried);

    mine.deliver(mine.continued('state', 3, carried));
    mine.deliver(mine.continued('completed', 4, carried));

    expect(mine.streams.active.has(mine.turn.event.id)).toBe(false);
    expect(mine.finished).toStrictEqual([{ id: mine.turn.event.id, ok: true }]);
  });

  it('reports a finished tool, not a running one', async () => {
    const mine = await startedTurn();

    mine.deliver(mine.event('tool', 1));
    mine.deliver(mine.event('tool', 2));

    expect(mine.toolsFinished).toStrictEqual([mine.turn.event.id]);
  });
});

describe('a provider that is retrying', () => {
  it('shows only the reconnecting marker, never the provider wording, and clears it afterwards', async () => {
    const mine = await startedTurn();
    const session = rig.service.state(rig.owner, mine.chat.id);
    const base = {
      session_id: session.session_id,
      chat_id: mine.chat.id,
      epoch: session.epoch ?? 1,
      delivery_id: mine.turn.event.id,
      native_turn: 1,
      kind: 'state',
    } as const;

    mine.deliver({ ...base, seq: 1, session: { ...session, reconnecting: true } });
    expect(mine.turn.stream.current()).toMatchObject({
      state: 'thinking',
      reason: CHAT_RECONNECTING_REASON,
    });

    mine.deliver({ ...base, seq: 2, session: { ...session, reconnecting: false } });
    expect(mine.turn.stream.current().reason).toBeNull();
  });
});

describe('the delivery log', () => {
  it('records a reconnect when the provider retries, not every assistant attempt', async () => {
    const logs = captureLogs();
    const mine = await startedTurn();
    const session = rig.service.state(rig.owner, mine.chat.id);
    const base = {
      session_id: session.session_id,
      chat_id: mine.chat.id,
      epoch: session.epoch ?? 1,
      delivery_id: mine.turn.event.id,
      native_turn: 1,
      kind: 'state',
      session,
    } as const;

    mine.deliver({ ...base, seq: 1, assistant_attempt: { id: 'step:1', state: 'started' } });
    mine.deliver({ ...base, seq: 2, assistant_attempt: { id: 'step:1', state: 'committed' } });
    expect(logs.events()).not.toContain('dsh.turn_reconnecting');

    mine.deliver({ ...base, seq: 3, session: { ...session, reconnecting: true } });
    expect(logs.events().filter((event) => event === 'dsh.turn_reconnecting')).toHaveLength(1);
  });
});

describe('messages the person sent while the turn worked', () => {
  it('are answered and reported with the turn that took them', async () => {
    const mine = await startedTurn();
    const steered = mine.addSteered();
    mine.turn.steered.push(steered);
    mine.deliver(mine.event('tool', 1));

    mine.deliver(mine.event('completed', 2));

    expect(mine.finished.map((entry) => entry.id)).toContain(steered.id);
    expect(mine.streams.ofChat(mine.chat.id)).toBeUndefined();
  });
});

describe('output after a steered message', () => {
  it('goes to a new reply row that follows the message, earlier output stays above it', async () => {
    const mine = await startedTurn();
    const { assistantChat } = rig.opened.store;
    const firstReply = mine.turn.replyId;
    mine.deliver(mine.text(1, 'before. '));
    const steered = mine.addSteered();
    mine.turn.steered.push(steered);
    mine.turn.after = steered.message_id;

    mine.deliver(mine.text(2, 'after.'));

    const nextReply = mine.turn.replyId;
    mine.deliver(mine.event('completed', 3));
    expect(nextReply).not.toBe(firstReply);
    expect(assistantChat.message(firstReply).text).toBe('before.');
    expect(assistantChat.message(firstReply).state).toBe('answered');
    expect(assistantChat.message(nextReply).text).toBe('after.');
    expect(assistantChat.message(nextReply).reply_to).toBe(steered.message_id);
    const order = assistantChat
      .messages({ chatId: mine.chat.id, limit: 50 })
      .reverse()
      .map((row) => row.id)
      .filter((id) => [firstReply, steered.message_id, nextReply].includes(id));
    expect(order).toStrictEqual([firstReply, steered.message_id, nextReply]);
  });

  it('waits for a running tool to finish before moving to the new row', async () => {
    const mine = await startedTurn();
    const firstReply = mine.turn.replyId;
    mine.deliver(mine.event('tool', 1));
    const steered = mine.addSteered();
    mine.turn.steered.push(steered);
    mine.turn.after = steered.message_id;

    mine.deliver(mine.text(2, 'still running.'));
    expect(mine.turn.replyId).toBe(firstReply);
    const running = mine.event('tool', 1);
    mine.deliver(running.kind === 'tool' ? { ...running, seq: 3, state: 'completed' } : running);
    mine.deliver(mine.text(4, 'now.'));

    expect(mine.turn.replyId).not.toBe(firstReply);
    mine.deliver(mine.event('completed', 5));
  });
});
