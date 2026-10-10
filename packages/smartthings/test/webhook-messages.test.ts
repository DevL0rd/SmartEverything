import { describe, expect, it } from 'vitest';
import { SmartThingsResponseError } from '../src/errors';
import {
  HANDLED_EVENT_TYPES,
  isSmartThingsUrl,
  pingAnswer,
  readWebhookEvent,
  readWebhookMessage,
  WEBHOOK_EVENT_ANSWER,
} from '../src/webhook-messages';

const DEVICE_EVENT = {
  eventTime: '2017-09-13T04:18:12.469Z',
  eventType: 'DEVICE_EVENT',
  deviceEvent: {
    subscriptionName: 'se_0123456789abcdef',
    eventId: 'b66aab69-ea4d-11ef-ad0f-bb2d43a06ec6',
    locationId: 'location-1',
    deviceId: 'device-1',
    componentId: 'main',
    capability: 'switch',
    attribute: 'switch',
    value: 'on',
    valueType: 'string',
    stateChange: true,
    data: {},
  },
};

const LIFECYCLE_EVENT = {
  eventTime: '2017-09-13T04:18:12Z',
  eventType: 'DEVICE_LIFECYCLE_EVENT',
  deviceLifecycleEvent: {
    lifecycle: 'CREATE',
    eventId: 'e',
    locationId: 'location-1',
    deviceId: 'device-2',
    deviceName: 'Lamp',
  },
};

const HEALTH_EVENT = {
  eventTime: '2017-09-13T04:18:12.469Z',
  eventType: 'DEVICE_HEALTH_EVENT',
  deviceHealthEvent: {
    eventId: 'e',
    locationId: 'location-1',
    deviceId: 'device-1',
    hubId: 'hub-1',
    status: 'OFFLINE',
    reason: 'NONE',
  },
};

function eventMessage(events: readonly unknown[]): unknown {
  return {
    lifecycle: 'EVENT',
    executionId: 'x',
    locale: 'en',
    version: '1.0.0',
    eventData: {
      authToken: 'token',
      installedApp: { installedAppId: 'app-1', locationId: 'location-1', config: {} },
      events,
    },
  };
}

describe('webhook messages', () => {
  it('reads a PING by its lifecycle and answers its challenge', () => {
    expect(readWebhookMessage({ lifecycle: 'PING', pingData: { challenge: 'c-1' } })).toEqual({
      kind: 'ping',
      challenge: 'c-1',
    });
    expect(pingAnswer('c-1')).toEqual({ pingData: { challenge: 'c-1' } });
  });

  it('reads a CONFIRMATION by its message type', () => {
    expect(
      readWebhookMessage({
        messageType: 'CONFIRMATION',
        confirmationData: {
          appId: 'app-id',
          confirmationUrl: 'https://api.smartthings.com/apps/app-id/confirm-registration?token=t',
        },
      }),
    ).toEqual({
      kind: 'confirmation',
      appId: 'app-id',
      confirmationUrl: 'https://api.smartthings.com/apps/app-id/confirm-registration?token=t',
    });
  });

  it('reads every device, lifecycle and health event and keeps the others apart', () => {
    const message = readWebhookMessage(
      eventMessage([DEVICE_EVENT, LIFECYCLE_EVENT, HEALTH_EVENT, { eventType: 'MODE_EVENT' }]),
    );
    expect(message).toEqual({
      kind: 'event',
      installedAppId: 'app-1',
      events: [
        {
          kind: 'event',
          event: {
            eventTime: '2017-09-13T04:18:12.469Z',
            eventType: 'DEVICE_EVENT',
            deviceEvent: {
              deviceId: 'device-1',
              componentId: 'main',
              capability: 'switch',
              attribute: 'switch',
              value: 'on',
              stateChange: true,
              data: {},
            },
          },
        },
        {
          kind: 'event',
          event: {
            eventTime: '2017-09-13T04:18:12Z',
            eventType: 'DEVICE_LIFECYCLE_EVENT',
            deviceLifecycleEvent: { lifecycle: 'CREATE', deviceId: 'device-2' },
          },
        },
        {
          kind: 'event',
          event: {
            eventTime: '2017-09-13T04:18:12.469Z',
            eventType: 'DEVICE_HEALTH_EVENT',
            deviceHealthEvent: { deviceId: 'device-1', status: 'OFFLINE' },
          },
        },
        { kind: 'ignored', eventType: 'MODE_EVENT' },
      ],
    });
    expect(HANDLED_EVENT_TYPES).toEqual([
      'DEVICE_EVENT',
      'DEVICE_LIFECYCLE_EVENT',
      'DEVICE_HEALTH_EVENT',
    ]);
    expect(WEBHOOK_EVENT_ANSWER).toEqual({ eventData: {} });
  });

  it('reads an EVENT whose installed app has no location', () => {
    expect(
      readWebhookMessage({
        messageType: 'EVENT',
        eventData: { installedApp: { installedAppId: 'app-1' }, events: [] },
      }),
    ).toEqual({ kind: 'event', installedAppId: 'app-1', events: [] });
  });

  it('marks an unreadable event without losing the rest of the batch', () => {
    const entry = readWebhookEvent({ ...DEVICE_EVENT, eventTime: 'yesterday' });
    expect(entry.kind).toBe('unreadable');
    expect(entry.kind === 'unreadable' ? entry.error : null).toBeInstanceOf(
      SmartThingsResponseError,
    );
    expect(entry.kind === 'unreadable' ? entry.error.message : '').toMatch(
      /^The SmartThings webhook DEVICE_EVENT did not have the expected shape: .*not a date and time/s,
    );
    expect(readWebhookEvent({ ...HEALTH_EVENT, deviceHealthEvent: { deviceId: '' } }).kind).toBe(
      'unreadable',
    );
    expect(readWebhookEvent('text')).toEqual({ kind: 'ignored', eventType: '' });
    expect(readWebhookEvent({ eventType: 42 })).toEqual({ kind: 'ignored', eventType: '' });
  });

  it('ignores lifecycles it does not handle, naming them', () => {
    expect(readWebhookMessage({ lifecycle: 'INSTALL' })).toEqual({
      kind: 'ignored',
      lifecycle: 'INSTALL',
    });
    expect(readWebhookMessage({})).toEqual({ kind: 'ignored', lifecycle: '' });
    expect(readWebhookMessage({ lifecycle: null, messageType: 'UNINSTALL' })).toEqual({
      kind: 'ignored',
      lifecycle: 'UNINSTALL',
    });
  });

  it('refuses a message that is not an object or a known lifecycle of the wrong shape', () => {
    expect(() => readWebhookMessage('PING')).toThrow(
      /^The SmartThings webhook message did not have the expected shape/,
    );
    expect(() => readWebhookMessage({ lifecycle: 'PING' })).toThrow(
      /^The SmartThings webhook PING did not have the expected shape/,
    );
    expect(() =>
      readWebhookMessage({
        messageType: 'CONFIRMATION',
        confirmationData: { appId: 'a', confirmationUrl: 'not a url' },
      }),
    ).toThrow(/^The SmartThings webhook CONFIRMATION did not have the expected shape/);
    expect(() => readWebhookMessage({ lifecycle: 'EVENT', eventData: {} })).toThrow(
      /^The SmartThings webhook EVENT did not have the expected shape/,
    );
  });
});

describe('SmartThings URLs', () => {
  it('accepts HTTPS on smartthings.com and its subdomains only', () => {
    expect(isSmartThingsUrl('https://api.smartthings.com/apps/x/confirm-registration')).toBe(true);
    expect(isSmartThingsUrl('https://smartthings.com/x')).toBe(true);
    for (const url of [
      'http://api.smartthings.com/x',
      'https://api.smartthings.com.evil.test/x',
      'https://evilsmartthings.com/x',
      'https://user@api.smartthings.com/x',
      'https://:pass@api.smartthings.com/x',
      'https://api.smartthings.com:8443/x',
      'https://127.0.0.1/x',
    ]) {
      expect(isSmartThingsUrl(url)).toBe(false);
    }
  });
});
