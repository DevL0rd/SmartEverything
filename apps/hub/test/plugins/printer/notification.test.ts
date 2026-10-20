import {
  GROUP_TAG,
  STATUS,
  attribute,
  encodeMessage,
  ipp,
  IppStatusError,
} from '@smarteverything/ipp';
import { describe, expect, it } from 'vitest';
import { notificationOf } from '../../../src/plugins/builtin/printer/notification';

function reply(status: number, sequence: number | null, interval: number | null): Uint8Array {
  const operation = [
    attribute('attributes-charset', ipp.charset('utf-8')),
    attribute('attributes-natural-language', ipp.language('en')),
    ...(interval === null ? [] : [attribute('notify-get-interval', ipp.integer(interval))]),
  ];
  const groups = [
    { tag: GROUP_TAG.operation, attributes: operation },
    ...(sequence === null
      ? []
      : [
          {
            tag: GROUP_TAG.eventNotification,
            attributes: [
              attribute('notify-sequence-number', ipp.integer(sequence)),
              attribute('notify-subscribed-event', ipp.keyword('printer-state-changed')),
              attribute('printer-state', ipp.enumeration(3)),
            ],
          },
        ]),
  ];
  return encodeMessage({
    major: 2,
    minor: 0,
    code: status,
    requestId: 1,
    groups,
    data: new Uint8Array(0),
  });
}

function http(body: Uint8Array): { status: number; contentType: string; body: Uint8Array } {
  return { status: 200, contentType: 'application/ipp', body };
}

describe('notification reply', () => {
  it('reads events and the interval from a successful reply', () => {
    const result = notificationOf(http(reply(STATUS.ok, 4, 30)));
    expect(result.lapsed).toBe(false);
    expect(result.intervalSeconds).toBe(30);
    expect(result.events.map((event) => event.sequence)).toStrictEqual([4]);
  });

  it('accepts the events-complete status', () => {
    const result = notificationOf(http(reply(STATUS.okEventsComplete, 5, null)));
    expect(result.lapsed).toBe(false);
    expect(result.events).toHaveLength(1);
  });

  it.each([STATUS.notFound, STATUS.gone])(
    'reports a lapsed subscription for status 0x%s',
    (status) => {
      const result = notificationOf(http(reply(status, null, null)));
      expect(result.lapsed).toBe(true);
      expect(result.events).toStrictEqual([]);
    },
  );

  it.each([STATUS.busy, STATUS.serviceUnavailable, STATUS.temporaryError])(
    'treats status 0x%s as nothing to report yet',
    (status) => {
      const result = notificationOf(http(reply(status, null, null)));
      expect(result.lapsed).toBe(false);
      expect(result.events).toStrictEqual([]);
    },
  );

  it('throws on any other refusal, naming the status', () => {
    expect(() => notificationOf(http(reply(STATUS.operationNotSupported, null, null)))).toThrow(
      IppStatusError,
    );
  });

  it('reads several replies in one multipart answer', () => {
    const boundary = 'b';
    const part = (bytes: Uint8Array): Buffer =>
      Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/ipp\r\n\r\n`),
        Buffer.from(bytes),
        Buffer.from('\r\n'),
      ]);
    const body = Buffer.concat([
      part(reply(STATUS.ok, 1, null)),
      part(reply(STATUS.ok, 2, 9)),
      Buffer.from(`--${boundary}--\r\n`),
    ]);
    const result = notificationOf({
      status: 200,
      contentType: `multipart/mixed; boundary=${boundary}`,
      body,
    });
    expect(result.events.map((event) => event.sequence)).toStrictEqual([1, 2]);
    expect(result.intervalSeconds).toBe(9);
  });
});
