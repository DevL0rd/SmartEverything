import { ROUTER_SNAPSHOT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  CollectParseError,
  parseCollectOutput,
  parseFields,
} from '../../../src/plugins/builtin/router/collect-parse';
import { buildFrame } from '../../../src/plugins/builtin/router/frame';
import { collectReply } from './collect-fixture';

const first = collectReply({
  at: 1000,
  wanRx: 0,
  wanTx: 0,
  busyJiffies: 0,
  slow: true,
  withStatic: true,
});
const second = collectReply({
  at: 1002,
  wanRx: 25_000_000,
  wanTx: 2_500_000,
  busyJiffies: 1000,
  slow: false,
  withStatic: false,
});

describe('router collect parsing', () => {
  it('rejects a reply without the end marker', () => {
    expect(() => parseCollectOutput('TS=1\n')).toThrow(CollectParseError);
  });

  it('keeps spaces in values such as network names', () => {
    expect(parseFields('band=5GHz-1 ssid=Home Network 5 radio=1')).toEqual({
      band: '5GHz-1',
      ssid: 'Home Network 5',
      radio: '1',
    });
  });

  it('computes rates and carries slow and static data forward', () => {
    const one = buildFrame(parseCollectOutput(first), null, 1_000_000);
    const two = buildFrame(parseCollectOutput(second), one.state, 1_002_000);
    const network = two.parts.network;
    expect(network?.downloadMbps).toBe(100);
    expect(network?.uploadMbps).toBe(10);
    expect(network?.publicIp).toBe('203.0.113.7');
    expect(network?.ports).toEqual([{ port: 'eth0', link: 'Up 1000 Mbps full duplex' }]);
    expect(two.parts.system?.cpuPercent).toBe(50);
    expect(two.parts.system?.memoryUsedPercent).toBe(60);
    expect(two.parts.info?.model).toBe('GT-AXE16000');
    expect(two.parts.radios.map((radio) => [radio.band, radio.ssid, radio.clients])).toEqual([
      ['5GHz-1', 'Home Network 5', 1],
      ['2.4GHz', 'Home Network', 0],
    ]);
  });

  it('merges leases, Wi-Fi stations, ARP and blocks into clients', () => {
    const { parts } = buildFrame(parseCollectOutput(first), null, 1_000_000);
    expect(
      parts.clients.map((client) => [
        client.name,
        client.connection,
        client.connected,
        client.blocked,
      ]),
    ).toEqual([
      ['Phone', 'wifi', true, false],
      ['Desktop', 'wired', true, false],
      ['192.168.50.22', null, false, true],
    ]);
    expect(parts.stations[0]?.rssiDbm).toBe(-48);
    expect(parts.stations[0]?.trafficBytesPerSecond).toBe(1_000_000);
  });

  it('produces snapshots the shared contract accepts', () => {
    const { parts } = buildFrame(parseCollectOutput(first), null, 1_000_000);
    const snapshot = {
      at: new Date(0).toISOString(),
      connection: { state: 'online' },
      cadence: 'fast',
      intervalSeconds: 2,
      ...parts,
    };
    expect(ROUTER_SNAPSHOT.safeParse(snapshot).success).toBe(true);
  });
});
