import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  WAKE_REPEATS,
  directedBroadcast,
  wakeAddresses,
  wakeOnLanWith,
} from '../src/network/wake-on-lan';

function ipv4(address: string, netmask: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask,
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: null,
  };
}

const INTERFACES = (): NodeJS.Dict<readonly NetworkInterfaceInfo[]> => ({
  lo: [ipv4('127.0.0.1', '255.0.0.0', true)],
  eth0: [ipv4('192.168.50.2', '255.255.255.0')],
  wifi0: [ipv4('10.1.2.3', '255.255.0.0')],
});

describe('Wake-on-LAN', () => {
  it('works out the broadcast address of a subnet', () => {
    expect(directedBroadcast('192.168.50.2', '255.255.255.0')).toBe('192.168.50.255');
    expect(directedBroadcast('10.1.2.3', '255.255.240.0')).toBe('10.1.15.255');
    expect(directedBroadcast('fe80::1', '255.255.255.0')).toBeNull();
  });

  it('aims at the global broadcast, every local subnet and the last known host', () => {
    expect(wakeAddresses(INTERFACES, '192.168.50.54')).toStrictEqual([
      '255.255.255.255',
      '192.168.50.255',
      '10.1.255.255',
      '192.168.50.54',
    ]);
    expect(wakeAddresses(INTERFACES, null)).toHaveLength(3);
  });

  it('sends the magic packet several times to every address', async () => {
    const sent: [string, number][] = [];
    const wake = wakeOnLanWith((packet, address) => {
      sent.push([address, packet.length]);
      return Promise.resolve();
    }, INTERFACES);
    await wake('a1:b2:c3:d4:e5:f6', '192.168.50.54');
    expect(sent).toHaveLength(4 * WAKE_REPEATS);
    expect(new Set(sent.map(([, length]) => length))).toStrictEqual(new Set([102]));
  });
});
