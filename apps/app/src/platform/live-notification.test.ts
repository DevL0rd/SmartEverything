import { describe, expect, it } from 'vitest';
import { ALERT_CHANNEL, notificationRequestOf } from './live-notification';

const NOTICE = {
  type: 'notification',
  requestId: '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73',
  id: 'eventId=1&kind=doorbell',
  title: 'Doorbell',
  body: 'Someone is at the door',
  data: { eventId: '1', kind: 'doorbell' },
} as const;

describe('a live notification shown by the phone', () => {
  it('appears at once on the alerts channel, named so a second one replaces it', () => {
    expect(notificationRequestOf(NOTICE)).toEqual({
      identifier: 'eventId=1&kind=doorbell',
      content: {
        title: 'Doorbell',
        body: 'Someone is at the door',
        data: { eventId: '1', kind: 'doorbell' },
      },
      trigger: { channelId: ALERT_CHANNEL },
    });
  });

  it('carries the reply buttons of the category the hub names', () => {
    const request = notificationRequestOf({
      ...NOTICE,
      data: { kind: 'assistant_reply', messageId: 'm1', categoryId: 'assistant_reply' },
    });
    expect(request.content).toMatchObject({ categoryIdentifier: 'assistant_reply' });
  });

  it('keeps everything a tap needs in the data', () => {
    expect(notificationRequestOf(NOTICE).content.data).toEqual(NOTICE.data);
  });
});
