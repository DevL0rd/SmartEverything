import { describe, expect, it } from 'vitest';
import {
  LIVE_CLIENT_MESSAGE,
  LIVE_NOTICE,
  LIVE_NOTIFICATION_NOTICE,
  liveNotificationId,
} from '../src';

const NOTICE = {
  type: 'notification',
  id: 'eventId=1',
  requestId: '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73',
  title: 'Doorbell',
  body: 'Someone is at the door',
  data: { eventId: '1', kind: 'doorbell' },
} as const;

describe('live notification notice', () => {
  it('carries a title, a body and what a tap needs, and travels as a live notice', () => {
    expect(LIVE_NOTIFICATION_NOTICE.parse(NOTICE)).toEqual(NOTICE);
    expect(LIVE_NOTICE.parse(NOTICE)).toEqual(NOTICE);
  });

  it('refuses a notification without a name, with a number in its data or with extra fields', () => {
    expect(LIVE_NOTIFICATION_NOTICE.safeParse({ ...NOTICE, id: '' }).success).toBe(false);
    expect(LIVE_NOTIFICATION_NOTICE.safeParse({ ...NOTICE, data: { count: 1 } }).success).toBe(
      false,
    );
    expect(LIVE_NOTIFICATION_NOTICE.safeParse({ ...NOTICE, sound: 'loud' }).success).toBe(false);
    expect(LIVE_NOTIFICATION_NOTICE.safeParse({ ...NOTICE, requestId: 'x' }).success).toBe(false);
  });

  it('names a notification by its subject, whatever the order of the subject’s keys', () => {
    expect(liveNotificationId({ kind: 'assistant_reply', messageId: 'm1' })).toBe(
      'kind=assistant_reply&messageId=m1',
    );
    expect(liveNotificationId({ messageId: 'm1', kind: 'assistant_reply' })).toBe(
      liveNotificationId({ kind: 'assistant_reply', messageId: 'm1' }),
    );
    expect(liveNotificationId({ eventId: 'a' })).not.toBe(liveNotificationId({ eventId: 'b' }));
  });
});

describe('background subscription', () => {
  it('may say the app is in the background, and is in front when it says nothing', () => {
    const quiet = { type: 'subscribe', tables: [], streams: [] };
    expect(LIVE_CLIENT_MESSAGE.parse(quiet)).toStrictEqual(quiet);
    expect(LIVE_CLIENT_MESSAGE.parse({ ...quiet, background: true })).toStrictEqual({
      ...quiet,
      background: true,
    });
    expect(LIVE_CLIENT_MESSAGE.safeParse({ ...quiet, background: 'yes' }).success).toBe(false);
  });
});
