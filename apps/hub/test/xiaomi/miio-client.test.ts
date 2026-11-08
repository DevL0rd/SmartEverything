import { createSocket } from 'node:dgram';
import { Logger } from '@smarteverything/logging';
import { MiioDeviceError, parseToken } from '@smarteverything/xiaomi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MessageIds,
  MiioClient,
  MiioTimeoutError,
  MiioUnreachableError,
} from '../../src/adapters/xiaomi/miio-client';
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
    messageIds: new MessageIds(0),
  });
});

afterEach(async () => {
  await client.close();
  await device.stop();
});

describe('the miIO message ids', () => {
  it('counts on from the random seed instead of restarting at 1', () => {
    const ids = MessageIds.seeded(Uint8Array.from([0x12, 0x34, 0x56, 0x78]));
    const first = [ids.next(), ids.next()];
    expect(first).toStrictEqual([0x091a2b3c + 1, 0x091a2b3c + 2]);
    expect(ids.next()).toBe(0x091a2b3c + 3);
  });

  it('wraps to 1 after the largest id the protocol allows', () => {
    const ids = MessageIds.seeded(Uint8Array.from([0xff, 0xff, 0xff, 0xff]));
    expect(ids.next()).toBe(1);
  });
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

  it('fails calls queued behind an unanswered one at once and shares one probe afterwards', async () => {
    await client.handshake();
    device.silent = true;
    const started = Date.now();
    const settled = await Promise.allSettled(
      [1, 2, 3].map(() => client.call('get_properties', [])),
    );
    const elapsed = Date.now() - started;
    expect(settled.map((result) => result.status)).toStrictEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    const reasons = settled.flatMap((result) => (result.status === 'rejected' ? [result] : []));
    expect(reasons).toHaveLength(3);
    expect(reasons[0]?.reason).toBeInstanceOf(MiioTimeoutError);
    expect(reasons[0]?.reason).not.toBeInstanceOf(MiioUnreachableError);
    expect(reasons[1]?.reason).toBeInstanceOf(MiioUnreachableError);
    expect(reasons[2]?.reason).toBeInstanceOf(MiioUnreachableError);
    expect(elapsed).toBeLessThan(450);
  });

  it('probes an unresponsive device with one attempt and recovers on the first answer', async () => {
    await client.handshake();
    device.silent = true;
    await expect(client.call('get_properties', [])).rejects.toThrow(MiioTimeoutError);
    const probeStarted = Date.now();
    await expect(client.call('get_properties', [])).rejects.toThrow(MiioTimeoutError);
    expect(Date.now() - probeStarted).toBeLessThan(250);
    device.silent = false;
    await expect(client.call('get_properties', [])).resolves.toStrictEqual([]);
    await expect(client.call('get_properties', [])).resolves.toStrictEqual([]);
  });

  it('still retries a first request that meets a transient drop', async () => {
    await client.handshake();
    device.silent = true;
    const pending = client.call('get_properties', []);
    setTimeout(() => {
      device.silent = false;
    }, 100);
    await expect(pending).resolves.toStrictEqual([]);
  });
});
