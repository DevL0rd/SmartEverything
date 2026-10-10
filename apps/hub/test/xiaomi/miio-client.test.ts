import { createSocket } from 'node:dgram';
import { Logger } from '@smarteverything/logging';
import { MiioDeviceError, parseToken } from '@smarteverything/xiaomi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MiioClient, MiioTimeoutError } from '../../src/adapters/xiaomi/miio-client';
import { FakeMiioDevice } from './fake-device';
import { dependencies, routedFetch } from './harness';

const TOKEN = '0123456789abcdef0123456789abcdef';

let device: FakeMiioDevice;
let client: MiioClient;

beforeEach(async () => {
  device = new FakeMiioDevice({
    host: '127.0.0.4',
    deviceId: 0x0a0b0c0d,
    token: TOKEN,
    properties: { '2.1': 42 },
  });
  const port = await device.start();
  client = new MiioClient({
    host: '127.0.0.4',
    port,
    token: parseToken(TOKEN),
    socket: createSocket('udp4'),
    timing: dependencies(routedFetch([]), port).timing,
    now: (): number => Date.now(),
    log: new Logger('tool.xiaomi-test'),
  });
});

afterEach(async () => {
  await client.close();
  await device.stop();
});

describe('the miIO UDP client', () => {
  it('handshakes once and then sends encrypted requests with the device clock', async () => {
    const handshake = await client.handshake();
    expect(handshake).toStrictEqual({ deviceId: 0x0a0b0c0d, stamp: 1000, revealedToken: null });
    await expect(
      client.call('get_properties', [{ did: 'x', siid: 2, piid: 1 }]),
    ).resolves.toStrictEqual([{ siid: 2, piid: 1, code: 0, value: 42 }]);
    await client.call('get_properties', [{ did: 'x', siid: 2, piid: 1 }]);
    expect(device.handshakes).toBe(1);
    expect(device.requests.map((request) => request.stamp)).toStrictEqual([1001, 1002]);
  });

  it('turns a device error into a named error', async () => {
    await expect(client.call('reboot_now', [])).rejects.toThrow(
      new MiioDeviceError('reboot_now', -9999, 'unknown method reboot_now'),
    );
  });

  it('times out with a named error once every attempt went unanswered', async () => {
    await client.handshake();
    device.silent = true;
    await expect(client.call('get_properties', [])).rejects.toThrow(
      new MiioTimeoutError('127.0.0.4', 'the miIO handshake', 150),
    );
    device.silent = false;
    await expect(client.call('get_properties', [])).resolves.toStrictEqual([]);
  });

  it('serialises concurrent calls so replies never cross', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() => client.call('get_properties', [{ did: 'x', siid: 2, piid: 1 }])),
    );
    expect(results).toHaveLength(3);
    expect(device.requests).toHaveLength(3);
  });
});
