import { API_ENDPOINTS as E, ApiError, type LiveNotificationNotice } from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { presentLiveAlert } from './background-alerts-host';

const held = vi.hoisted(() => ({ call: vi.fn(), present: vi.fn() }));

vi.mock('../../../api/transport', () => ({
  api: (): { readonly call: typeof held.call } => ({ call: held.call }),
  connectionRefused: (): void => undefined,
  useConnection: (): { readonly status: 'unpaired' } => ({ status: 'unpaired' }),
}));

vi.mock('../../../platform/live-notification', () => ({
  presentLiveNotification: held.present,
}));

vi.mock('../../../store/push-command-notice', () => ({
  runPushCommandNotice: (): void => undefined,
}));

const NOTICE = {
  type: 'notification',
  requestId: '6d0f4b8a-2c31-4f6e-9a58-1b7e3c2d4f60',
  id: 'camera=9367fc35-4c2a-4c8e-8f7a-2d5b1e9c0a63&kind=baby_cry',
  title: 'Baby crying',
  body: 'Fynn is crying',
  data: { kind: 'baby_cry' },
} as const satisfies LiveNotificationNotice;

let written: LogRecord[] = [];

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function failures(): readonly LogRecord[] {
  return written.filter((record) => record.event === 'alerts.present_failed');
}

function confirmFailures(): readonly LogRecord[] {
  return written.filter((record) => record.event === 'alerts.confirm_failed');
}

beforeEach(() => {
  held.call.mockReset();
  held.present.mockReset();
  written = [];
  Logger.configure({
    level: 'trace',
    sink: (record) => {
      written.push(record);
    },
  });
});

afterEach(() => {
  Logger.reset();
});

describe('showing a live alert and answering the hub', () => {
  it('keeps a shown alert shown when the hub has already settled the answer', async () => {
    held.present.mockResolvedValue(undefined);
    held.call.mockRejectedValue(
      new ApiError('not_found', 'This phone action already finished or was never sent.'),
    );
    presentLiveAlert(NOTICE);
    await settle();
    expect(held.call).toHaveBeenCalledExactlyOnceWith(E.answerPhoneAction, {
      body: { requestId: NOTICE.requestId, ok: true, detail: 'Shown' },
    });
    expect(failures()).toEqual([]);
    expect(written.some((record) => record.event === 'alerts.confirm_settled')).toBe(true);
    expect(written.find((record) => record.event === 'alerts.confirm_settled')?.level).toBe('info');
  });

  it('answers ok when the alert was shown and the hub accepted the answer', async () => {
    held.present.mockResolvedValue(undefined);
    held.call.mockResolvedValue(undefined);
    presentLiveAlert(NOTICE);
    await settle();
    expect(held.call).toHaveBeenCalledExactlyOnceWith(E.answerPhoneAction, {
      body: { requestId: NOTICE.requestId, ok: true, detail: 'Shown' },
    });
    expect(failures()).toEqual([]);
  });

  it('reports a failed confirmation under its own event, not as a presentation failure', async () => {
    held.present.mockResolvedValue(undefined);
    held.call.mockRejectedValue(new Error('the hub is unreachable'));
    presentLiveAlert(NOTICE);
    await settle();
    expect(held.call).toHaveBeenCalledExactlyOnceWith(E.answerPhoneAction, {
      body: { requestId: NOTICE.requestId, ok: true, detail: 'Shown' },
    });
    expect(failures()).toEqual([]);
    expect(confirmFailures()).toHaveLength(1);
    expect(confirmFailures()[0]?.failure?.message).toBe('the hub is unreachable');
    expect(confirmFailures()[0]?.payload['id']).toBe(NOTICE.id);
  });

  it('keeps the presentation failure as the reason when the refusal cannot be sent', async () => {
    held.present.mockRejectedValue(new Error('the notification channel is unavailable'));
    held.call.mockRejectedValue(new Error('the hub is unreachable'));
    presentLiveAlert(NOTICE);
    await settle();
    expect(held.call).toHaveBeenCalledExactlyOnceWith(E.answerPhoneAction, {
      body: {
        requestId: NOTICE.requestId,
        ok: false,
        detail: 'Error: the notification channel is unavailable',
      },
    });
    expect(failures()).toHaveLength(1);
    expect(failures()[0]?.failure?.message).toBe('the notification channel is unavailable');
    expect(confirmFailures()).toEqual([]);
    expect(written.some((record) => record.event === 'alerts.refusal_failed')).toBe(true);
  });
});
