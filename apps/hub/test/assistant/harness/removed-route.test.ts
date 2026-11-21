import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiChatRow } from '@smarteverything/domain';
import {
  AssistantDelivery,
  DELIVERY_RETRY_MS,
  type Routing,
} from '../../../src/assistant/delivery';
import { deliveryPorts } from '../../../src/assistant/delivery-ports';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { DshRunner } from '../../../src/assistant/engines/dsh/runner';
import { RETRY_WAIT_MS } from '../../../src/assistant/engines/dsh/turn-retry';
import type { StoredEvent } from '../../../src/store/repositories/assistant-events';
import { mainDeliveryEvents } from '../../support/delivery-events';
import { captureLogs, testLogger } from '../../support/logs';
import { useRig, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

afterEach(() => {
  vi.useRealTimers();
});

interface Fixture {
  readonly delivery: AssistantDelivery;
  readonly conversation: ConversationLog;
  readonly chat: AiChatRow;
  readonly ended: { readonly id: string; readonly ok: boolean }[];
  readonly retrying: boolean[];
  readonly send: (text: string) => { readonly event: StoredEvent; readonly messageId: string };
}

function fixture(): Fixture {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const conversation = new ConversationLog(store);
  const ended: { id: string; ok: boolean }[] = [];
  const retrying: boolean[] = [];
  const engine = new DshRunner({
    service: rig.service,
    dispatcher: { runtime: { pendingInput: (): readonly string[] => [] } },
    conversation,
    emit: (): undefined => undefined,
    finished: (event, _text, ok): void => {
      ended.push({ id: event.id, ok });
    },
  }).engine();
  const ports = deliveryPorts({
    options: {
      emit: (notice): void => {
        if (notice.type === 'chat_activity') retrying.push(notice.reason !== null);
      },
    },
    conversation,
    publisher: { publish: (): undefined => undefined },
    delegation: () => ({ admit: (): Promise<boolean> => Promise.resolve(true) }),
    ended: (event, _text, ok): void => {
      ended.push({ id: event.id, ok });
    },
  });
  const delivery = new AssistantDelivery({
    events: mainDeliveryEvents(store),
    route: (): Promise<Routing> =>
      Promise.resolve({ kind: 'engine', engine, chat: store.aiChats.chat(chat.id) }),
    ...ports,
    log: testLogger('delivery'),
  });
  const send = (text: string): { event: StoredEvent; messageId: string } => {
    const question = addMessage(rig, chat.id, { role: 'person', text });
    const event = store.assistantEvents.add({
      id: randomUUID(),
      kind: 'chat',
      chat_id: chat.id,
      message_id: question.id,
      profile_id: rig.owner.profileId,
      client_id: null,
      text,
    });
    return { event, messageId: question.id };
  };
  return { delivery, conversation, chat, ended, retrying, send };
}

function removeRoute(chat: AiChatRow): void {
  const { store } = rig.opened;
  const engine = store.aiChats.chat(chat.id).engine;
  if (engine.kind !== 'dsh') throw new Error('The test chat is not a native chat.');
  store.aiChats.update(chat.id, { engine: { ...engine, model_route_id: randomUUID() } });
}

describe('a chat whose model route was removed', () => {
  it('fails the message once with model_unavailable and never retries it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const logs = captureLogs();
    const mine = fixture();
    removeRoute(mine.chat);
    const { event, messageId } = mine.send('turn the lights on');

    mine.delivery.pump();
    const { store } = rig.opened;
    await vi.waitFor(() => {
      expect(store.assistantChat.message(messageId).state).toBe('failed');
    });
    await vi.advanceTimersByTimeAsync(Math.max(DELIVERY_RETRY_MS, RETRY_WAIT_MS) * 5);
    await mine.delivery.settled();
    await mine.conversation.settled();

    const message = store.assistantChat.message(messageId);
    expect(message.state).toBe('failed');
    expect(message.reason_code).toBe('model_unavailable');
    expect(message.reason).toMatch(/model route was removed/);
    expect(mine.ended).toStrictEqual([{ id: event.id, ok: false }]);
    expect(mine.retrying).toStrictEqual([]);
    expect(store.assistantEvents.pending().map((row) => row.id)).not.toContain(event.id);
    expect(rig.hub.requests.filter((request) => request.kind === 'prompt')).toHaveLength(0);
    expect(logs.events().filter((name) => name === 'assistant.delivery_given_up')).toHaveLength(1);
    expect(logs.events()).not.toContain('assistant.delivery_failed');
    expect(logs.events()).not.toContain('assistant.delivery_retry_scheduled');
    expect(vi.getTimerCount()).toBe(0);
  });
});
