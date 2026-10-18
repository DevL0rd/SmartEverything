import { PUSH_PAYLOAD_KEY, type WatchActionResult } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushCommandChannel, type PushCommandOutcome } from '../../src/extensions/push/commands';
import { WatchActionBroker, phonesOf, type WatchActionTarget } from '../../src/local/watch-actions';
import { ANSWER_TIMEOUT_MS } from '../../src/local/pending-answers';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const PAYLOAD = z.record(z.string(), z.unknown());

const SENT: PushCommandOutcome = { outcome: 'sent' };

let test: TestStore;
let channel: PushCommandChannel;
let broker: WatchActionBroker;
let outcomes: Map<string, PushCommandOutcome>;
let delivered: { clientId: string; payload: Record<string, unknown> }[];
let profileId: string;
let target: WatchActionTarget;

function phone(name: string, platform: 'android' | 'web' = 'android'): string {
  return test.store.clients.create({
    name,
    platform,
    role: 'member',
    tokenHash: name.padEnd(64, 'x'),
  }).id;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00.000Z'));
  captureLogs();
  test = await testStore();
  profileId = test.store.profiles.first().id;
  outcomes = new Map();
  delivered = [];
  channel = new PushCommandChannel();
  channel.attach((clientId, data) => {
    delivered.push({
      clientId,
      payload: PAYLOAD.parse(JSON.parse(data[PUSH_PAYLOAD_KEY] ?? '{}')),
    });
    return Promise.resolve(outcomes.get(clientId) ?? SENT);
  });
  broker = new WatchActionBroker(channel, test.store, testLogger('watch'));
  target = { deviceId: 'watch-1', profileId, name: 'Fit Watch', bridgeClientId: null };
});

afterEach(async () => {
  vi.useRealTimers();
  await test.close();
});

describe('phonesOf', () => {
  it('lists the Android phones of the person and ignores other platforms and other people', () => {
    const mine = phone('mine');
    phone('browser', 'web');
    const other = test.store.profiles.create({ name: 'Sam' });
    const theirs = phone('theirs');
    test.store.clients.useProfile(theirs, other.id);
    expect(phonesOf(test.store, profileId)).toEqual([mine]);
    expect(phonesOf(test.store, other.id)).toEqual([theirs]);
  });

  it('uses only the bridging phone when it is one of the person phones', () => {
    const bridge = phone('bridge');
    phone('spare');
    expect(phonesOf(test.store, profileId, bridge)).toEqual([bridge]);
  });

  it('falls back to every phone when the bridging phone is not theirs', () => {
    const first = phone('first');
    const second = phone('second');
    expect(phonesOf(test.store, profileId, 'gone')).toEqual([first, second]);
  });
});

describe('WatchActionBroker', () => {
  it('asks the phone with the action and resolves with the phone answer', async () => {
    const id = phone('mine');
    const running = broker.run(target, { type: 'sync' }, 'Alex');
    await vi.advanceTimersByTimeAsync(0);
    expect(delivered).toHaveLength(1);
    const payload = delivered[0]?.payload ?? {};
    expect(payload).toMatchObject({
      deviceId: 'watch-1',
      action: { type: 'sync' },
      expiresAt: new Date(Date.now() + ANSWER_TIMEOUT_MS).toISOString(),
    });
    const answer: WatchActionResult = { ok: true, detail: 'Synced.' };
    broker.answer(id, String(payload['requestId']), answer);
    await expect(running).resolves.toEqual(answer);
  });

  it('answers that the phone did not answer once the window passes', async () => {
    phone('mine');
    const running = broker.run(target, { type: 'refresh' }, 'Alex');
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS);
    await expect(running).resolves.toEqual({
      ok: false,
      detail: 'The phone did not answer within 25 s.',
    });
  });

  it('only waits for the phones the message reached', async () => {
    const reached = phone('reached');
    const failed = phone('failed');
    outcomes.set(failed, { outcome: 'failed', reason: 'token expired' });
    const running = broker.run(target, { type: 'sync' }, 'Alex');
    await vi.advanceTimersByTimeAsync(0);
    const requestId = String(delivered[0]?.payload['requestId']);
    expect(() => {
      broker.answer(failed, requestId, { ok: true, detail: 'x' });
    }).toThrow('This phone was not asked to do that.');
    broker.answer(reached, requestId, { ok: true, detail: 'done' });
    await expect(running).resolves.toEqual({ ok: true, detail: 'done' });
  });

  it('says why no phone could be reached, without waiting', async () => {
    for (const name of ['mine', 'spare']) {
      outcomes.set(phone(name), { outcome: 'no_target', reason: 'no push token' });
    }
    await expect(broker.run(target, { type: 'sync' }, 'Alex')).resolves.toEqual({
      ok: false,
      detail: 'Fit Watch’s phone could not be reached: no push token; no push token',
    });
  });

  it('tells the person to open the app when no phone has signed up yet', async () => {
    await expect(broker.run(target, { type: 'sync' }, 'Alex')).resolves.toEqual({
      ok: false,
      detail:
        'No phone of Fit Watch’s person has signed up for push messages yet; open SmartEverything on the phone once.',
    });
  });

  it('resolves waiting actions as failed when the hub stops', async () => {
    phone('mine');
    const running = broker.run(target, { type: 'sync' }, 'Alex');
    await vi.advanceTimersByTimeAsync(0);
    broker.stop();
    await expect(running).resolves.toEqual({ ok: false, detail: 'The hub is stopping.' });
  });
});
