import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AiChatRow } from '@smarteverything/domain';
import { AssistantDelivery, type DeliveryOptions } from '../../src/assistant/delivery';
import type { Engine } from '../../src/assistant/engines/engine';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { testLogger } from '../support/logs';
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
  readonly add: (text: string) => StoredEvent;
}

function fixture(deliver: (event: StoredEvent, attempt: number) => Promise<void>): Fixture {
  const { store } = rig.opened;
  const chat: AiChatRow = rig.newChat(rig.hub.target);
  const attempts: string[] = [];
  const given: string[] = [];
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
  return { delivery, attempts, given, add };
}

describe('a delivery that fails', () => {
  it('is tried once and given up at once when the failure is permanent', async () => {
    const mine = fixture(() => Promise.reject(new ApiError('forbidden', 'No grant.')));
    mine.add('hello');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mine.attempts).toEqual(['hello']);
    expect(mine.given).toEqual(['hello']);
  });

  it('retries a transient failure and settles quietly when a later attempt succeeds', async () => {
    const mine = fixture((_event, attempt) =>
      attempt < 3 ? Promise.reject(new ApiError('upstream_failed', 'Down.')) : Promise.resolve(),
    );
    mine.add('hello');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mine.attempts).toEqual(['hello', 'hello', 'hello']);
    expect(mine.given).toEqual([]);
  });

  it('gives up after three transient failures', async () => {
    const mine = fixture(() => Promise.reject(new ApiError('upstream_failed', 'Down.')));
    mine.add('hello');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mine.attempts).toHaveLength(3);
    expect(mine.given).toEqual(['hello']);
  });

  it('leaves the chat free for the next message', async () => {
    const mine = fixture((event) =>
      event.text === 'first'
        ? Promise.reject(new ApiError('forbidden', 'No grant.'))
        : Promise.resolve(),
    );
    mine.add('first');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(60_000);
    mine.add('second');
    mine.delivery.pump();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mine.attempts).toEqual(['first', 'second']);
    expect(mine.given).toEqual(['first']);
  });
});
