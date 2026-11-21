import {
  ROUTER_INVENTORY,
  ROUTER_LIVE,
  type NetworkClient,
  type RouterSnapshot,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientRegistry } from '../../../src/plugins/builtin/router/client-registry';
import { RouterCollector } from '../../../src/plugins/builtin/router/collector';
import type { RouterShell } from '../../../src/plugins/builtin/router/router-shell';
import {
  LIVE_STREAM,
  RouterStreams,
  SNAPSHOT_STREAM,
} from '../../../src/plugins/builtin/router/streams';
import { testLogger } from '../../support/logs';
import { memoryRecords } from '../memory-records';
import { collectReply } from './collect-fixture';

const PHONE = 'aa:bb:cc:00:00:01';
const T0 = Date.parse('2026-10-18T08:00:00.000Z');

function client(mac: string, connected: boolean): NetworkClient {
  return {
    mac,
    name: mac,
    ip: null,
    connection: connected ? 'wifi' : null,
    band: null,
    connected,
    blocked: false,
    trafficBytesPerSecond: null,
    profileId: null,
    personId: null,
    firstSeen: null,
    lastSeen: null,
  };
}

function snapshot(patch: Partial<RouterSnapshot> = {}): RouterSnapshot {
  return {
    at: new Date(T0).toISOString(),
    connection: { state: 'online' },
    cadence: 'fast',
    intervalSeconds: 1,
    info: null,
    system: null,
    network: null,
    radios: [],
    stations: [],
    clients: [],
    people: [],
    ...patch,
  };
}

interface Sent {
  readonly stream: string;
  readonly bytes: number;
  readonly viewers: boolean;
}

function streamsRig(): { readonly streams: RouterStreams; readonly sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    streams: new RouterStreams(
      (stream, value) => {
        sent.push({ stream, bytes: JSON.stringify(value).length, viewers: false });
      },
      (stream, value) => {
        sent.push({ stream, bytes: JSON.stringify(value).length, viewers: true });
      },
    ),
  };
}

function count(sent: readonly Sent[], stream: string): number {
  return sent.filter((entry) => entry.stream === stream).length;
}

describe('the router streams', () => {
  it('send the live part every time and the client list only when it changes', () => {
    const { streams, sent } = streamsRig();
    const clients = [client(PHONE, true)];
    streams.publish(snapshot({ clients }), 'everyone');
    for (let second = 1; second <= 9; second += 1) {
      streams.publish(
        snapshot({ at: new Date(T0 + second * 1000).toISOString(), clients }),
        'everyone',
      );
    }
    expect(count(sent, LIVE_STREAM)).toBe(10);
    expect(count(sent, SNAPSHOT_STREAM)).toBe(1);
    streams.publish(snapshot({ clients: [client(PHONE, false)] }), 'everyone');
    expect(count(sent, SNAPSHOT_STREAM)).toBe(2);
    streams.publish(snapshot({ clients: [client(PHONE, false)] }), 'everyone');
    expect(count(sent, SNAPSHOT_STREAM)).toBe(2);
  });

  it('send viewer-only live frames to viewers and keep the client list for everyone', () => {
    const { streams, sent } = streamsRig();
    streams.publish(snapshot({ clients: [client(PHONE, true)] }), 'viewers');
    streams.publish(snapshot({ clients: [client(PHONE, true)] }), 'viewers');
    expect(
      sent.filter((entry) => entry.stream === LIVE_STREAM).map((entry) => entry.viewers),
    ).toEqual([true, true]);
    expect(
      sent.filter((entry) => entry.stream === SNAPSHOT_STREAM).map((entry) => entry.viewers),
    ).toEqual([false]);
  });

  it('ignore per-second traffic and uptime when deciding to resend the client list', () => {
    const { streams, sent } = streamsRig();
    const info = { model: null, firmware: null, lanIp: null, uptimeSeconds: 10 };
    streams.publish(snapshot({ info, clients: [client(PHONE, true)] }), 'everyone');
    streams.publish(
      snapshot({
        info: { ...info, uptimeSeconds: 11 },
        clients: [{ ...client(PHONE, true), trafficBytesPerSecond: 900 }],
      }),
      'everyone',
    );
    expect(count(sent, SNAPSHOT_STREAM)).toBe(1);
    expect(count(sent, LIVE_STREAM)).toBe(2);
  });
});

function radio(
  band: string,
  telemetry: Pick<
    RouterSnapshot['radios'][number],
    'noiseDbm' | 'temperatureCelsius' | 'airtimeBusyPercent'
  >,
): RouterSnapshot['radios'][number] {
  return {
    band,
    ssid: 'Home',
    enabled: true,
    txPower: 20,
    channel: 36,
    width: '80 MHz',
    dfs: null,
    clients: 1,
    ...telemetry,
  };
}

describe('the router inventory', () => {
  it('publishes once when only radio telemetry, uptime and client rates change', () => {
    const { streams, sent } = streamsRig();
    const info = { model: 'AX', firmware: '1', lanIp: null, uptimeSeconds: 100 };
    streams.publish(
      snapshot({
        info,
        radios: [radio('5 GHz', { noiseDbm: -92, temperatureCelsius: 50, airtimeBusyPercent: 10 })],
        clients: [client(PHONE, true)],
      }),
      'everyone',
    );
    streams.publish(
      snapshot({
        at: new Date(T0 + 10_000).toISOString(),
        info: { ...info, uptimeSeconds: 110 },
        radios: [radio('5 GHz', { noiseDbm: -89, temperatureCelsius: 53, airtimeBusyPercent: 47 })],
        clients: [{ ...client(PHONE, true), trafficBytesPerSecond: 12_000 }],
      }),
      'everyone',
    );
    expect(count(sent, SNAPSHOT_STREAM)).toBe(1);
    expect(count(sent, LIVE_STREAM)).toBe(2);
  });

  it('carries the radio telemetry on the live part and leaves it out of the inventory', () => {
    const values: { readonly stream: string; readonly value: unknown }[] = [];
    const streams = new RouterStreams(
      (stream, value) => {
        values.push({ stream, value });
      },
      () => undefined,
    );
    const telemetry = { noiseDbm: -90, temperatureCelsius: 48, airtimeBusyPercent: 22 };
    streams.publish(snapshot({ radios: [radio('2.4 GHz', telemetry)] }), 'everyone');
    expect(
      ROUTER_LIVE.parse(values.find((entry) => entry.stream === LIVE_STREAM)?.value).radios,
    ).toEqual([{ band: '2.4 GHz', ...telemetry }]);
    expect(
      ROUTER_INVENTORY.parse(values.find((entry) => entry.stream === SNAPSHOT_STREAM)?.value)
        .radios,
    ).toEqual([
      {
        band: '2.4 GHz',
        ssid: 'Home',
        enabled: true,
        txPower: 20,
        channel: 36,
        width: '80 MHz',
        dfs: null,
        clients: 1,
      },
    ]);
  });
});

describe('the router stream while the page is watched', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the client list once while it does not change and keeps each live frame small', async () => {
    const { streams, sent } = streamsRig();
    const registry = new ClientRegistry(memoryRecords(), () => undefined, new Logger('hub.router'));
    let bytes = 0;
    const shell: RouterShell = {
      collect: (line) => {
        bytes += 1000;
        return Promise.resolve(
          collectReply({
            at: Date.now() / 1000,
            wanRx: bytes,
            wanTx: bytes,
            busyJiffies: 10,
            slow: line.split(' ')[2] === '1',
            withStatic: true,
          }),
        );
      },
      run: () => Promise.reject(new Error('not used')),
      close: () => undefined,
    };
    const collector = new RouterCollector({
      shell,
      pingTarget: '1.1.1.1',
      log: testLogger('router'),
      record: (): void => undefined,
      publish: (frame, audience): void => {
        streams.publish(
          { ...frame, clients: registry.observe(frame.clients, new Date()) },
          audience,
        );
      },
    });
    collector.setCadence('fast');
    await vi.advanceTimersByTimeAsync(20_000);
    collector.stop();
    const live = count(sent, LIVE_STREAM);
    expect(live).toBeGreaterThanOrEqual(19);
    expect(count(sent, SNAPSHOT_STREAM)).toBe(1);
    const liveBytes = sent.filter((entry) => entry.stream === LIVE_STREAM);
    const inventory = sent.find((entry) => entry.stream === SNAPSHOT_STREAM);
    expect(Math.max(...liveBytes.map((entry) => entry.bytes))).toBeLessThan(inventory?.bytes ?? 0);
  });
});
