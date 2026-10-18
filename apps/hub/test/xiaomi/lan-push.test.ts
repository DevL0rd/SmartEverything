import { createSocket } from 'node:dgram';
import { Logger } from '@smarteverything/logging';
import { parseToken } from '@smarteverything/xiaomi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanPush, type PushListener } from '../../src/adapters/xiaomi/lan-push';
import { MiioClient } from '../../src/adapters/xiaomi/miio-client';
import { until } from '../support/wait';
import { FakeMiioDevice } from './fake-device';
import { dependencies, routedFetch } from './harness';

const TOKEN = '0123456789abcdef0123456789abcdef';
const DEVICE_ID = 0x0a0b0c0d;

let device: FakeMiioDevice;
let client: MiioClient;
let push: LanPush;
let delivered: string[];
let known: ReadonlySet<string>;

function listener(): PushListener {
  return {
    subscribed: (): void => undefined,
    uplink: (): void => undefined,
    childUplink: (uplink) =>
      known.has(uplink.childDid)
        ? (): void => {
            delivered.push(uplink.childDid);
          }
        : null,
    changed: (): void => undefined,
    lost: (): void => undefined,
    returned: (): void => undefined,
  };
}

function click(id: number, child: string): string {
  return JSON.stringify({
    id,
    method: 'event.click',
    params: [],
    sid: child,
    model: 'lumi.sensor_switch',
  });
}

beforeEach(async () => {
  delivered = [];
  known = new Set();
  device = new FakeMiioDevice({
    host: '127.0.0.4',
    deviceId: DEVICE_ID,
    token: TOKEN,
    properties: {},
  });
  const port = await device.start();
  const timing = dependencies(routedFetch([]), port).timing;
  client = new MiioClient({
    host: '127.0.0.4',
    port,
    token: parseToken(TOKEN),
    socket: createSocket('udp4'),
    timing,
    now: (): number => Date.now(),
    log: new Logger('tool.xiaomi-test'),
  });
  push = new LanPush(
    {
      did: String(DEVICE_ID),
      host: '127.0.0.4',
      client,
      virtualDid: 1n,
      timing,
      now: (): number => Date.now(),
      jitter: (): number => 0.5,
      log: new Logger('tool.xiaomi-test'),
    },
    listener(),
  );
  push.start();
  await until(() => device.handshakes > 0);
});

afterEach(async () => {
  await push.close();
  await client.close();
  await device.stop();
});

describe('LAN push child events', () => {
  it('acknowledges a child event nobody can deliver, so the gateway stops resending it', async () => {
    device.push(click(11, 'lumi.unknown'));
    await until(() => device.acks.length === 1);
    expect(JSON.parse(device.acks[0] ?? '')).toStrictEqual({ id: 11, result: { code: 0 } });
    expect(delivered).toStrictEqual([]);
  });

  it('acknowledges and delivers a child event for a known device, once per message id', async () => {
    known = new Set(['lumi.1']);
    device.push(click(12, 'lumi.1'));
    device.push(click(12, 'lumi.1'));
    await until(() => device.acks.length === 2);
    expect(delivered).toStrictEqual(['lumi.1']);
  });

  it('acknowledges a gateway heartbeat without delivering anything', async () => {
    device.push(JSON.stringify({ id: 21, method: 'event.gw.heartbeat', params: [{ rssi: 0 }] }));
    await until(() => device.acks.length === 1);
    expect(JSON.parse(device.acks[0] ?? '')).toStrictEqual({ id: 21, result: { code: 0 } });
    expect(delivered).toStrictEqual([]);
  });
});
