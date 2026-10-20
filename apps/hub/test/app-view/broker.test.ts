import { APP_VIEW_NOTICE, type AppViewNotice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VIEW_ANSWER_MS, AppViewBroker } from '../../src/app-view/broker';
import { captureLogs, testLogger } from '../support/logs';

const PHONE = 'phone-client';
const OPEN_FITNESS = {
  action: 'open',
  target: { kind: 'section', section: 'fitness' },
  focus: null,
} as const;

let sent: { clientId: string; notice: AppViewNotice }[];
let reached: number;
let broker: AppViewBroker;

beforeEach(() => {
  vi.useFakeTimers();
  captureLogs();
  sent = [];
  reached = 1;
  broker = new AppViewBroker((clientId, notice) => {
    sent.push({ clientId, notice });
    return Promise.resolve(reached);
  }, testLogger());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('asking an app to show something', () => {
  it('sends the request as a notice the app can read and returns what the app answers', async () => {
    const outcome = broker.ask(PHONE, OPEN_FITNESS);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    const notice = APP_VIEW_NOTICE.parse(sent[0]?.notice);
    expect(notice.request).toMatchObject(OPEN_FITNESS);
    broker.answer(PHONE, notice.request.requestId, {
      ok: true,
      opened: 'Fitness',
      highlighted: false,
      reason: null,
    });
    await expect(outcome).resolves.toEqual({
      kind: 'answered',
      result: { ok: true, opened: 'Fitness', highlighted: false, reason: null },
    });
  });

  it('reports an app that has no live link without waiting', async () => {
    reached = 0;
    await expect(broker.ask(PHONE, OPEN_FITNESS)).resolves.toEqual({ kind: 'not_reached' });
  });

  it('gives up when the app stays silent for the answer window', async () => {
    const outcome = broker.ask(PHONE, OPEN_FITNESS);
    await vi.advanceTimersByTimeAsync(APP_VIEW_ANSWER_MS);
    await expect(outcome).resolves.toEqual({ kind: 'unanswered' });
  });

  it('refuses an answer from an app that was not asked', async () => {
    const outcome = broker.ask(PHONE, OPEN_FITNESS);
    await vi.advanceTimersByTimeAsync(0);
    const requestId = APP_VIEW_NOTICE.parse(sent[0]?.notice).request.requestId;
    expect(() => {
      broker.answer('other-client', requestId, { ok: false, reason: 'app_not_in_front' });
    }).toThrow(/not asked/u);
    broker.stop();
    await expect(outcome).resolves.toEqual({ kind: 'unanswered' });
  });

  it('refuses an answer for a request that already finished', () => {
    expect(() => {
      broker.answer(PHONE, '33333333-3333-4333-8333-333333333333', {
        ok: false,
        reason: 'target_not_found',
      });
    }).toThrow(/already finished/u);
  });
});
