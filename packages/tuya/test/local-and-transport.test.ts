import { describe, expect, it } from 'vitest';
import {
  LOCAL_KEY_LENGTH,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  TRANSPORT_REASONS,
  chooseTransport,
  classifyLocalPayload,
  isKeyMismatchError,
  isUsableLocalKey,
  reconnectDelay,
  type TransportFacts,
} from '../src';

const wifi: TransportFacts = {
  sub: false,
  hasLocalKey: true,
  keyRejected: false,
  sleepingSensor: false,
  seenOnLan: true,
  hasNodeId: false,
  hasGatewayId: false,
  gatewayLocal: false,
};

describe('local payloads', () => {
  it('reads data point reports with and without a sub-device id', () => {
    expect(classifyLocalPayload({ dps: { '1': true }, t: 1 })).toStrictEqual({
      kind: 'dps',
      dps: { '1': true },
      cid: null,
    });
    expect(classifyLocalPayload({ dps: { '1': true }, cid: 'a4c1' })).toStrictEqual({
      kind: 'dps',
      dps: { '1': true },
      cid: 'a4c1',
    });
  });

  it('treats unreadable bytes as a key mismatch and readable text as a device message', () => {
    expect(classifyLocalPayload('3.3\u0000\u0000garbage')).toStrictEqual({ kind: 'key_mismatch' });
    expect(classifyLocalPayload('é')).toStrictEqual({ kind: 'key_mismatch' });
    expect(classifyLocalPayload('json obj data unvalid')).toStrictEqual({
      kind: 'device_message',
      text: 'json obj data unvalid',
    });
    expect(classifyLocalPayload('')).toStrictEqual({ kind: 'device_message', text: '' });
  });

  it('ignores acknowledgements and frames without data points', () => {
    expect(classifyLocalPayload(false)).toStrictEqual({ kind: 'empty' });
    expect(classifyLocalPayload({ t: 1 })).toStrictEqual({ kind: 'empty' });
    expect(classifyLocalPayload({ dps: {}, cid: '' })).toStrictEqual({ kind: 'empty' });
  });

  it('recognises the session key mismatch of protocols 3.4 and 3.5', () => {
    expect(isKeyMismatchError('HMAC mismatch(keys): expected a, was b.')).toBe(true);
    expect(isKeyMismatchError('connection timed out')).toBe(false);
    expect(isKeyMismatchError('Error: HMAC mismatch')).toBe(false);
  });

  it('accepts only sixteen-character local keys', () => {
    expect(LOCAL_KEY_LENGTH).toBe(16);
    expect(isUsableLocalKey('abcdefghijklmnop')).toBe(true);
    expect(isUsableLocalKey('abcdefghijklmno')).toBe(false);
    expect(isUsableLocalKey(null)).toBe(false);
  });
});

describe('transport choice', () => {
  it('names every reason', () => {
    expect(TRANSPORT_REASONS).toStrictEqual([
      'on_lan',
      'via_gateway',
      'no_local_key',
      'key_rejected',
      'sleeping_sensor',
      'not_on_lan',
      'gateway_not_on_lan',
      'no_node_id',
      'cloud_library',
    ]);
  });

  it('goes local for a keyed Wi-Fi device seen on the LAN', () => {
    expect(chooseTransport(wifi)).toStrictEqual({ transport: 'local', reason: 'on_lan' });
  });

  it('goes to the cloud for a Wi-Fi device without a key, asleep, or not seen', () => {
    expect(chooseTransport({ ...wifi, hasLocalKey: false })).toStrictEqual({
      transport: 'cloud',
      reason: 'no_local_key',
    });
    expect(chooseTransport({ ...wifi, keyRejected: true })).toStrictEqual({
      transport: 'cloud',
      reason: 'key_rejected',
    });
    expect(chooseTransport({ ...wifi, sleepingSensor: true })).toStrictEqual({
      transport: 'cloud',
      reason: 'sleeping_sensor',
    });
    expect(chooseTransport({ ...wifi, seenOnLan: false })).toStrictEqual({
      transport: 'cloud',
      reason: 'not_on_lan',
    });
  });

  it('routes a sub-device through its gateway only when the gateway is local and the node is known', () => {
    const sub = { ...wifi, sub: true, hasLocalKey: false, seenOnLan: false, sleepingSensor: true };
    expect(chooseTransport({ ...sub, hasNodeId: true, gatewayLocal: true })).toStrictEqual({
      transport: 'local',
      reason: 'via_gateway',
    });
    expect(chooseTransport({ ...sub, hasNodeId: true, gatewayLocal: false })).toStrictEqual({
      transport: 'cloud',
      reason: 'gateway_not_on_lan',
    });
    expect(chooseTransport({ ...sub, hasNodeId: false, gatewayLocal: true })).toStrictEqual({
      transport: 'cloud',
      reason: 'no_node_id',
    });
  });

  it('backs off exponentially up to a minute', () => {
    expect(RECONNECT_BASE_MS).toBe(1000);
    expect(RECONNECT_MAX_MS).toBe(60_000);
    expect([0, 1, 2, 5, 6, 20].map(reconnectDelay)).toStrictEqual([
      1000, 2000, 4000, 32_000, 60_000, 60_000,
    ]);
  });
});
