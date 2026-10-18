import { describe, expect, it } from 'vitest';
import {
  MiioDeviceError,
  MiioPacketError,
  checkSubscription,
  isUplink,
  needsSubscription,
  parseUplink,
  statusNoticeId,
  subscriptionParams,
  uplinkAck,
} from '../src';

const DID = '123456';

function uplink(body: unknown): string {
  return JSON.stringify(body);
}

describe('subscription', () => {
  it('describes a wildcard subscription for the virtual device', () => {
    expect(subscriptionParams(42n, 1000)).toStrictEqual({
      version: '2.0',
      did: '42',
      update_ts: 1000,
      sub_method: '.',
    });
  });

  it('accepts a zero result code and refuses a missing or non-zero one', () => {
    expect(() => {
      checkSubscription('miIO.sub', { code: 0 });
    }).not.toThrow();
    expect(() => {
      checkSubscription('miIO.sub', { code: 3 });
    }).toThrow(MiioDeviceError);
    expect(() => {
      checkSubscription('miIO.sub', 'ok');
    }).toThrow(MiioPacketError);
  });

  it('asks for a new subscription only for the states that need one and a changed stamp', () => {
    expect(needsSubscription({ wildcard: true, subscribedAt: 5, state: 1 }, null)).toBe(true);
    expect(needsSubscription({ wildcard: true, subscribedAt: 5, state: 1 }, 5)).toBe(false);
    expect(needsSubscription({ wildcard: true, subscribedAt: 5, state: 2 }, null)).toBe(false);
  });
});

describe('uplink', () => {
  it('recognises a method call and ignores a reply', () => {
    expect(isUplink(uplink({ id: 1, method: 'properties_changed' }))).toBe(true);
    expect(isUplink(uplink({ id: 1, result: { code: 0 } }))).toBe(false);
  });

  it('refuses a body that is not JSON', () => {
    expect(() => parseUplink(DID, 'not json')).toThrow(MiioPacketError);
  });

  it('parses property changes into readings', () => {
    const text = uplink({
      id: 7,
      method: 'properties_changed',
      params: [{ did: DID, siid: 2, piid: 1, value: true }],
    });
    expect(parseUplink(DID, text)).toStrictEqual({
      kind: 'properties',
      id: 7,
      readings: [{ siid: 2, piid: 1, ok: true, value: true }],
    });
  });

  it('refuses property changes about another device', () => {
    const text = uplink({
      id: 7,
      method: 'properties_changed',
      params: [{ did: '999', siid: 2, piid: 1, value: true }],
    });
    expect(() => parseUplink(DID, text)).toThrow(MiioPacketError);
  });

  it('parses an event with its arguments, defaulting to none', () => {
    const base = { id: 8, method: 'event_occured' };
    const withArguments = uplink({
      ...base,
      params: { did: DID, siid: 3, eiid: 1, arguments: [{ piid: 1, value: 'a' }] },
    });
    const without = uplink({ ...base, params: { did: DID, siid: 3, eiid: 1 } });
    expect(parseUplink(DID, withArguments)).toStrictEqual({
      kind: 'event',
      id: 8,
      siid: 3,
      eiid: 1,
      arguments: [{ piid: 1, value: 'a' }],
    });
    expect(parseUplink(DID, without)).toMatchObject({ kind: 'event', arguments: [] });
    expect(() =>
      parseUplink('999', uplink({ ...base, params: { did: DID, siid: 3, eiid: 1 } })),
    ).toThrow(MiioPacketError);
  });

  it('parses a legacy child button event', () => {
    const text = uplink({
      id: 9,
      method: 'event.click',
      params: [],
      sid: 'lumi.158d0001',
      model: 'lumi.sensor_switch',
    });
    expect(parseUplink(DID, text)).toStrictEqual({
      kind: 'child-event',
      id: 9,
      childDid: 'lumi.158d0001',
      model: 'lumi.sensor_switch',
      method: 'event.click',
    });
  });

  it('parses a legacy child button event that carries extra fields and params', () => {
    const text = uplink({
      id: 10,
      method: 'event.long_click_press',
      params: [1, 'x'],
      sid: 'lumi.158d0001',
      model: 'lumi.sensor_switch',
      zigbee: { rssi: -60 },
    });
    expect(parseUplink(DID, text)).toStrictEqual({
      kind: 'child-event',
      id: 10,
      childDid: 'lumi.158d0001',
      model: 'lumi.sensor_switch',
      method: 'event.long_click_press',
    });
  });

  it('refuses an unsupported uplink', () => {
    expect(() => parseUplink(DID, uplink({ id: 1, method: 'other', params: [] }))).toThrow(
      MiioPacketError,
    );
  });

  it('recognises gateway heartbeats, child keep-alives and status props as notices', () => {
    expect(statusNoticeId(uplink({ id: 5, method: 'event.gw.heartbeat', params: [{}] }))).toBe(5);
    expect(statusNoticeId(uplink({ id: 6, method: 'event.keepalive', params: [], sid: 'x' }))).toBe(
      6,
    );
    expect(statusNoticeId(uplink({ id: 7, method: 'props', params: { ota_state: 'idle' } }))).toBe(
      7,
    );
    expect(statusNoticeId(uplink({ id: 8, method: 'properties_changed', params: [] }))).toBeNull();
  });

  it('acknowledges an uplink by id', () => {
    expect(JSON.parse(uplinkAck(11))).toStrictEqual({ id: 11, result: { code: 0 } });
  });
});
