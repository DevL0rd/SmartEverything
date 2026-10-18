import { LIVE_NOTIFICATION_NOTICE, type LiveNotificationNotice } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { call, openLive, type LiveClient } from '../support/server';
import { usePushBench } from './push-bench';

const SHOWN_WINDOW_MS = 8000;

const bench = usePushBench();

async function backgroundLink(token: string): Promise<LiveClient> {
  const live = await openLive(bench.booted.base, token);
  live.socket.send(
    JSON.stringify({ type: 'subscribe', tables: [], streams: [], background: true }),
  );
  await live.next((message) => message.type === 'subscribed');
  return live;
}

function isNotification(message: { readonly type: string }): boolean {
  return message.type === 'notification';
}

async function answerNotice(
  token: string,
  notice: LiveNotificationNotice,
  answer: { readonly ok: boolean; readonly detail: string },
): Promise<void> {
  const reply = await call(bench.booted.base, token, {
    method: 'POST',
    path: '/api/phones/actions/answer',
    body: { requestId: notice.requestId, ...answer },
  });
  expect(reply.status).toBe(200);
}

async function shown(live: LiveClient, token: string): Promise<LiveNotificationNotice> {
  const notice = LIVE_NOTIFICATION_NOTICE.parse(await live.next(isNotification));
  await answerNotice(token, notice, { ok: true, detail: 'Shown' });
  return notice;
}

describe('alerts over the live connection', () => {
  it('shows an urgent event on a phone whose app is alive, without the push service', async () => {
    const phone = await bench.registerPhone('fcm-live');
    const live = await backgroundLink(phone.token);
    bench.happen({});
    const notice = await shown(live, phone.token);
    expect(notice).toMatchObject({
      type: 'notification',
      title: 'Doorbell',
      body: 'Someone is at the door (Front door in Home)',
      data: { kind: 'doorbell' },
    });
    expect(bench.logs.events()).toContain('push.delivered_live');
    expect(bench.logs.events()).not.toContain('push.not_configured');
    expect(bench.google.sent).toEqual([]);
    expect(await bench.status()).toMatchObject({ lastError: null, sent: 0 });
    live.socket.close();
  });

  it('leaves the push service to the phones that are not connected', async () => {
    await bench.saveAccount();
    const near = await bench.registerPhone('fcm-near');
    await bench.registerPhone('fcm-far');
    const live = await backgroundLink(near.token);
    bench.happen({ kind: 'smoke' });
    await shown(live, near.token);
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(1);
    });
    expect(bench.google.sent[0]?.body).toMatchObject({ message: { token: 'fcm-far' } });
    live.socket.close();
  });

  it('names the notification after the event so a second delivery replaces the first', async () => {
    const phone = await bench.registerPhone('fcm-named');
    const live = await backgroundLink(phone.token);
    bench.happen({ kind: 'leak' });
    const notice = await shown(live, phone.token);
    const eventId = notice.data['eventId'] ?? '';
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(notice.id).toBe(`eventId=${eventId}&kind=leak`);
    live.socket.close();
  });

  it('alerts a phone that is only connected, with no push token saved', async () => {
    const phone = await bench.pairWithoutPushTarget();
    const live = await backgroundLink(phone.token);
    bench.happen({ kind: 'leak' });
    const notice = await shown(live, phone.token);
    expect(notice.data).toMatchObject({ kind: 'leak' });
    expect(bench.logs.events()).toContain('push.delivered_live');
    expect(bench.logs.events()).not.toContain('push.no_targets');
    live.socket.close();
  });

  it('sends the alert to the push service when the phone could not show it', async () => {
    await bench.saveAccount();
    const phone = await bench.registerPhone('fcm-refused');
    const live = await backgroundLink(phone.token);
    bench.happen({ kind: 'smoke' });
    const notice = LIVE_NOTIFICATION_NOTICE.parse(await live.next(isNotification));
    await answerNotice(phone.token, notice, { ok: false, detail: 'Notifications are off' });
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(1);
    });
    expect(bench.logs.events()).toContain('live.notification_not_shown');
    expect(bench.logs.events()).not.toContain('push.delivered_live');
    live.socket.close();
  });

  it('sends the alert to the push service when the phone never says it was shown', async () => {
    await bench.saveAccount();
    const phone = await bench.registerPhone('fcm-silent');
    const live = await backgroundLink(phone.token);
    bench.happen({ kind: 'smoke' });
    await live.next(isNotification);
    await vi.waitFor(
      () => {
        expect(bench.google.sent).toHaveLength(1);
      },
      { timeout: SHOWN_WINDOW_MS },
    );
    expect(bench.logs.events()).not.toContain('push.delivered_live');
    live.socket.close();
  });

  it('falls back to the push service once the connection is gone', async () => {
    await bench.saveAccount();
    const phone = await bench.registerPhone('fcm-gone');
    const live = await backgroundLink(phone.token);
    live.socket.close();
    await live.closed;
    bench.happen({});
    await vi.waitFor(() => {
      expect(bench.google.sent).toHaveLength(1);
    });
    expect(bench.logs.events()).not.toContain('push.delivered_live');
  });
});
