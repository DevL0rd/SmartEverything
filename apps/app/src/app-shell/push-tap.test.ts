import { describe, expect, it } from 'vitest';
import { pushTapOf } from './push-tap';

const EVENT = '00000000-0000-4000-8000-000000000001';
const DEVICE = '00000000-0000-4000-8000-000000000002';

describe('a tapped push notification', () => {
  it('names the event, its kind and its device', () => {
    expect(pushTapOf({ eventId: EVENT, kind: 'doorbell', deviceId: DEVICE })).toEqual({
      eventId: EVENT,
      kind: 'doorbell',
      deviceId: DEVICE,
    });
  });

  it('may come from an event without a device', () => {
    expect(pushTapOf({ eventId: EVENT, kind: 'automation_run' })).toEqual({
      eventId: EVENT,
      kind: 'automation_run',
    });
  });

  it('is nothing for a notification SmartEverything did not send', () => {
    expect(pushTapOf({ eventId: 'x', kind: 'doorbell' })).toBeNull();
    expect(pushTapOf({ eventId: EVENT, kind: 'party' })).toBeNull();
    expect(pushTapOf(null)).toBeNull();
  });
});
