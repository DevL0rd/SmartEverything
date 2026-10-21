import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_RETRYING_REASON,
  type AiChatRow,
  type ChatActivityNotice,
  type ChatStreamNotice,
} from '@smarteverything/domain';
import { CONTINUE_NOTE } from '../../../src/assistant/interruption';
import { RETRY_WAIT_MS } from '../../../src/assistant/engines/dsh/turn-retry';
import { ConversationLog } from '../../../src/assistant/conversation-log';
import { DshRunner } from '../../../src/assistant/engines/dsh/runner';
import { nativeReplyId } from '../../../src/assistant/engines/dsh/reconciliation';
import type { Engine } from '../../../src/assistant/engines/engine';
import type { StoredEvent } from '../../../src/store/repositories/assistant-events';
import { useRig, type Rig } from './support/rig';
import { addMessage } from './support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

interface Fixture {
  readonly engine: Engine;
  readonly chat: AiChatRow;
  readonly finished: { readonly id: string; readonly ok: boolean }[];
  readonly send: (text: string) => { readonly event: StoredEvent };
  readonly notices: (ChatActivityNotice | ChatStreamNotice)[];
}

function fixture(): Fixture {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const finished: { id: string; ok: boolean }[] = [];
  const notices: (ChatActivityNotice | ChatStreamNotice)[] = [];
  const engine = new DshRunner({
    service: rig.service,
    dispatcher: { runtime: { pendingInput: (): readonly string[] => [] } },
    conversation: new ConversationLog(store),
    emit: (notice): void => {
      notices.push(notice);
    },
    finished: (event, _text, ok): void => {
      finished.push({ id: event.id, ok });
    },
  }).engine();
  const send = (text: string): { event: StoredEvent } => {
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
    return { event };
  };
  return { engine, chat, finished, send, notices };
}

function promptsSent(): number {
  return rig.hub.requests.filter((request) => request.kind === 'prompt').length;
}

function prompts(): string[] {
  return rig.hub.requests.flatMap((request) => (request.kind === 'prompt' ? [request.text] : []));
}

describe('a prompt the host fails after the turn was admitted', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the turn retrying with one continue note every 2 seconds until Stop settles it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { engine, chat, send, notices } = fixture();
    rig.hub.script = (request): undefined => {
      if (request.kind === 'prompt') throw new Error('socket closed during the prompt');
      return undefined;
    };
    const { event } = send('turn the lights on');

    const delivered = engine.deliver(event, chat);
    await vi.waitFor(() => {
      expect(promptsSent()).toBe(1);
    });
    expect(notices.at(-1)).toMatchObject({ state: 'thinking', reason: CHAT_RETRYING_REASON });

    await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
    await vi.waitFor(() => {
      expect(promptsSent()).toBe(2);
    });
    expect(prompts().at(-1)).toBe(CONTINUE_NOTE);
    await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
    await vi.waitFor(() => {
      expect(promptsSent()).toBe(3);
    });
    expect(prompts().filter((text) => text === CONTINUE_NOTE)).toHaveLength(2);

    await engine.interrupt(chat);
    await expect(delivered).resolves.toBeUndefined();
    const { store } = rig.opened;
    const delivery = store.harnessDeliveries.find(event.id);
    if (delivery === undefined) throw new Error('The delivery was not admitted.');
    expect(store.assistantChat.message(nativeReplyId(delivery)).reason_code).toBe('stopped');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS * 5);
    expect(promptsSent()).toBe(3);
  });

  it('frees the chat after Stop so the next message is delivered to the host', async () => {
    const { engine, chat, send } = fixture();
    let refuse = true;
    rig.hub.script = (request): undefined => {
      if (request.kind === 'prompt' && refuse) throw new Error('socket closed during the prompt');
      return undefined;
    };
    const first = send('first');
    const settled = engine.deliver(first.event, chat);
    await vi.waitFor(() => {
      expect(promptsSent()).toBe(1);
    });
    await engine.interrupt(chat);
    await settled;
    refuse = false;

    const second = send('second');
    void engine.deliver(second.event, chat);

    await vi.waitFor(() => {
      expect(promptsSent()).toBe(2);
    });
    expect(rig.opened.store.harnessDeliveries.find(second.event.id)?.state).not.toBe('unknown');
  });
});
