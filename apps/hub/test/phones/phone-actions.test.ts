import { PUSH_PAYLOAD_KEY } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushCommandChannel, type PushCommandOutcome } from '../../src/extensions/push/commands';
import { ANSWER_TIMEOUT_MS } from '../../src/local/pending-answers';
import { LIVE_LEASE_MS, PhoneActionBroker } from '../../src/phones/phone-actions';
import { captureLogs, testLogger } from '../support/logs';

const PAYLOAD = z.record(z.string(), z.unknown());
const CLIENT = '3d000000-0000-4000-8000-000000000031';
const TARGET = { clientId: CLIENT, name: 'Pixel' };
const ALEX = { source: 'assistant', client: 'Alex' } as const;

let channel: PushCommandChannel;
let broker: PhoneActionBroker;
let outcome: PushCommandOutcome;
let delivered: Record<string, unknown>[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  captureLogs();
  outcome = { outcome: 'sent' };
  delivered = [];
  channel = new PushCommandChannel();
  channel.attach((_clientId, data) => {
    delivered.push(PAYLOAD.parse(JSON.parse(data[PUSH_PAYLOAD_KEY] ?? '{}')));
    return Promise.resolve(outcome);
  });
  broker = new PhoneActionBroker(channel, testLogger('phone'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PhoneActionBroker', () => {
  it('sends the action to the phone and resolves with the phone answer', async () => {
    const running = broker.run(TARGET, { type: 'ring', on: true }, ALEX);
    await vi.advanceTimersByTimeAsync(0);
    expect(delivered[0]).toMatchObject({ action: { type: 'ring', on: true }, origin: ALEX });
    broker.answer(CLIENT, String(delivered[0]?.['requestId']), { ok: true, detail: 'Ringing.' });
    await expect(running).resolves.toEqual({ ok: true, detail: 'Ringing.' });
  });

  it('says the phone could not be reached, without waiting, when the push is refused', async () => {
    outcome = { outcome: 'no_target', reason: 'no push token' };
    await expect(broker.run(TARGET, { type: 'ring', on: false }, ALEX)).resolves.toEqual({
      ok: false,
      detail: 'Pixel could not be reached: no push token',
    });
  });

  it('says the phone did not answer once the window passes', async () => {
    const running = broker.run(TARGET, { type: 'ring', on: true }, ALEX);
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS);
    await expect(running).resolves.toEqual({
      ok: false,
      detail: 'Pixel did not answer within 25 s; it may be off or without internet.',
    });
  });

  it('turns live mode on for ten minutes and says so to the phone', async () => {
    const running = broker.live(TARGET, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(delivered[0]).toMatchObject({
      action: { type: 'live', on: true },
      expiresAt: new Date(Date.now() + LIVE_LEASE_MS).toISOString(),
    });
    broker.answer(CLIENT, String(delivered[0]?.['requestId']), { ok: true, detail: 'Live.' });
    await expect(running).resolves.toEqual({ ok: true, detail: 'Live.' });
  });

  it('turns live mode off within the usual answer window', async () => {
    const running = broker.live(TARGET, false);
    await vi.advanceTimersByTimeAsync(0);
    expect(delivered[0]).toMatchObject({
      action: { type: 'live', on: false },
      expiresAt: new Date(Date.now() + ANSWER_TIMEOUT_MS).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS);
    await expect(running).resolves.toMatchObject({ ok: false });
  });

  it('fails a waiting action when the server stops', async () => {
    const running = broker.run(TARGET, { type: 'ring', on: true }, ALEX);
    await vi.advanceTimersByTimeAsync(0);
    broker.stop();
    await expect(running).resolves.toEqual({ ok: false, detail: 'The server is stopping.' });
  });
});
