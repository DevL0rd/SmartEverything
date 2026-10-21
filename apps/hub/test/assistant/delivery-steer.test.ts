import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AiChatRow } from '@smarteverything/domain';
import { AssistantDelivery, type DeliveryOptions } from '../../src/assistant/delivery';
import type { Engine } from '../../src/assistant/engines/engine';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import { testLogger } from '../support/logs';
import { useRig, type Rig } from './harness/support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

interface Fixture {
  readonly delivery: AssistantDelivery;
  readonly chat: AiChatRow;
  readonly delivered: string[];
  readonly steered: string[];
  readonly release: () => void;
  readonly add: (text: string) => StoredEvent;
}

function fixture(steer: Engine['steer']): Fixture {
  const { store } = rig.opened;
  const chat = rig.newChat(rig.hub.target);
  const delivered: string[] = [];
  const steered: string[] = [];
  const gates: (() => void)[] = [];
  const engine: Engine = {
    kind: 'dsh',
    ownerOnly: false,
    status: (): ReturnType<Engine['status']> => ({ state: 'ready', reason: null }),
    deliver: (event): Promise<void> => {
      delivered.push(event.text);
      return new Promise<void>((done) => {
        gates.push(done);
      });
    },
    ...(steer === undefined
      ? {}
      : {
          steer: (event, row): Promise<boolean> => {
            steered.push(event.text);
            return steer(event, row);
          },
        }),
    historyChanged: (): Promise<void> => Promise.resolve(),
    compact: (): Promise<boolean> => Promise.resolve(false),
    interrupt: (): Promise<void> => Promise.resolve(),
  };
  const delivery = new AssistantDelivery({
    events: store.assistantEvents,
    route: (): ReturnType<DeliveryOptions['route']> => ({ kind: 'engine', engine, chat }),
    delivered: (): undefined => undefined,
    failed: (): undefined => undefined,
    retrying: (): undefined => undefined,
    stopped: (): undefined => undefined,
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
  return {
    delivery,
    chat,
    delivered,
    steered,
    release: (): void => {
      gates.shift()?.();
    },
    add,
  };
}

async function settle(): Promise<void> {
  await vi.waitFor(() => undefined);
  await new Promise((done) => setImmediate(done));
}

describe('a message sent while the AI is working', () => {
  it('goes to the running turn instead of waiting for the next one', async () => {
    const mine = fixture(() => Promise.resolve(true));
    mine.add('first');
    mine.delivery.pump();
    const second = mine.add('and one more thing');

    mine.delivery.pump();
    await settle();

    expect(mine.steered).toStrictEqual(['and one more thing']);
    expect(mine.delivered).toStrictEqual(['first']);
    expect(rig.opened.store.assistantEvents.pending().some((event) => event.id === second.id)).toBe(
      false,
    );
  });

  it('waits its turn when the running turn cannot take it, and is offered only once', async () => {
    const mine = fixture(() => Promise.resolve(false));
    mine.add('first');
    mine.delivery.pump();
    mine.add('with a file');

    mine.delivery.pump();
    await settle();
    mine.delivery.pump();
    await settle();
    mine.release();
    await settle();

    expect(mine.steered).toStrictEqual(['with a file']);
    expect(mine.delivered).toStrictEqual(['first', 'with a file']);
  });

  it('waits its turn when the engine cannot take messages mid-work', async () => {
    const mine = fixture(undefined);
    mine.add('first');
    mine.delivery.pump();
    mine.add('second');

    mine.delivery.pump();
    await settle();
    mine.release();
    await settle();

    expect(mine.delivered).toStrictEqual(['first', 'second']);
  });
});
