import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AiChatRow } from '@smarteverything/domain';
import {
  AssistantDelivery,
  DELIVERY_RETRY_MS,
  type DeliveryOptions,
} from '../../src/assistant/delivery';
import type { Engine } from '../../src/assistant/engines/engine';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { captureLogs, testLogger } from '../support/logs';
import { useRig, type Rig } from './harness/support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

interface Fixture {
  readonly delivery: AssistantDelivery;
  readonly attempts: string[];
  readonly given: string[];
  readonly marks: string[];
  readonly stopped: string[];
  readonly add: (text: string) => StoredEvent;
}

function fixture(deliver: (event: StoredEvent, attempt: number) => Promise<void>): Fixture {
  const { store } = rig.opened;
  const chat: AiChatRow = rig.newChat(rig.hub.target);
  const attempts: string[] = [];
  const given: string[] = [];
  const marks: string[] = [];
  const stopped: string[] = [];
  const counts = new Map<string, number>();
  const engine: Engine = {
    kind: 'dsh',
    ownerOnly: false,
    status: (): ReturnType<Engine['status']> => ({ state: 'ready', reason: null }),
    deliver: (event): Promise<void> => {
      attempts.push(event.text);
      const attempt = (counts.get(event.id) ?? 0) + 1;
      counts.set(event.id, attempt);
      return deliver(event, attempt);
    },
    historyChanged: (): Promise<void> => Promise.resolve(),
    compact: (): Promise<boolean> => Promise.resolve(false),
    interrupt: (): Promise<void> => Promise.resolve(),
  };
  const delivery = new AssistantDelivery({
    events: store.assistantEvents,
    route: (): ReturnType<DeliveryOptions['route']> => ({ kind: 'engine', engine, chat }),
    delivered: (): undefined => undefined,
    failed: (event): undefined => {
      given.push(event.text);
    },
    retrying: (event, active): undefined => {
      marks.push(`${event.text}:${active ? 'retrying' : 'cleared'}`);
    },
    stopped: (event): undefined => {
      stopped.push(event.text);
    },
    log: testLogger('delivery'),
  });
  const add = (text: string): StoredEvent =>
    store.assistantEvents.add({
      id: randomUUID(),
      kind: 'chat',
      chat_id: chat.id,
      message_id: null,
      profile_id: rig.owner.profileId,
      client_id: null,
      text,
    });
  return { delivery, attempts, given, marks, stopped, add };
}

describe('a delivery that fails', () => {
  it('retries every 2 seconds for as long as it fails, whatever the error', async () => {
    const mine = fixture(() => Promise.reject(new ApiError('forbidden', 'No grant.')));
    mine.add('hello');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(0);
    expect(mine.attempts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(DELIVERY_RETRY_MS - 1);
    expect(mine.attempts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mine.attempts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(DELIVERY_RETRY_MS * 50);
    expect(mine.attempts).toHaveLength(52);
    expect(mine.given).toEqual([]);
    expect(mine.marks[0]).toBe('hello:retrying');
  });

  it('settles quietly when a later attempt succeeds', async () => {
    const mine = fixture((_event, attempt) =>
      attempt < 3 ? Promise.reject(new ApiError('upstream_failed', 'Down.')) : Promise.resolve(),
    );
    mine.add('hello');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mine.attempts).toEqual(['hello', 'hello', 'hello']);
    expect(mine.given).toEqual([]);
  });

  it('writes every failure to the log with its real error name and text', async () => {
    const logs = captureLogs();
    const mine = fixture(() => Promise.reject(new ApiError('forbidden', 'No grant.')));
    mine.add('hello');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(DELIVERY_RETRY_MS);
    const failed = logs.records.filter((record) => record.event === 'assistant.delivery_failed');
    expect(failed.length).toBeGreaterThanOrEqual(2);
    expect(failed[0]?.payload).toMatchObject({ cause: 'ApiError', reason: 'No grant.' });
  });

  it('ends the retry loop at once on Stop, marks the message stopped and leaves no timer', async () => {
    const mine = fixture(() => Promise.reject(new Error('Down.')));
    const chatId = mine.add('hello').chat_id;
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(0);
    expect(mine.delivery.stopChat(chatId)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(mine.stopped).toEqual(['hello']);
    expect(mine.marks.at(-1)).toBe('hello:cleared');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(DELIVERY_RETRY_MS * 10);
    expect(mine.attempts).toHaveLength(1);
    expect(mine.delivery.stopChat(chatId)).toBe(false);
  });

  it('leaves the chat free for the next message after a stop', async () => {
    const mine = fixture((event) =>
      event.text === 'first' ? Promise.reject(new Error('Down.')) : Promise.resolve(),
    );
    const first = mine.add('first');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(0);
    mine.delivery.stopChat(first.chat_id);
    await vi.advanceTimersByTimeAsync(0);
    mine.add('second');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(DELIVERY_RETRY_MS);
    expect(mine.attempts.filter((text) => text === 'second')).toHaveLength(1);
    expect(mine.attempts.filter((text) => text === 'first')).toHaveLength(1);
  });
});
