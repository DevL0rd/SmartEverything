import { EventEmitter } from 'node:events';
import type { NetworkInterfaceInfo } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addressesOf,
  homeLanAddress,
  interfaceEntries,
  isPrivateIPv4,
  lanInterfaces,
  type InterfaceSnapshot,
} from '../../src/network/lan';

const probe = vi.hoisted((): { outcome: string } => ({ outcome: 'error' }));

vi.mock('node:dgram', () => ({
  createSocket: (): EventEmitter =>
    Object.assign(new EventEmitter(), {
      connect: function connect(
        this: EventEmitter,
        _port: number,
        _host: string,
        ready: () => void,
      ) {
        if (probe.outcome === 'error') queueMicrotask(() => this.emit('error', new Error('x')));
        else queueMicrotask(ready);
      },
      address: () => ({ address: probe.outcome }),
      close: () => undefined,
    }),
}));

function entry(
  address: string,
  cidr: string | null,
  options: { internal?: boolean; family?: 'IPv4' | 'IPv6' } = {},
): NetworkInterfaceInfo {
  const family = options.family ?? 'IPv4';
  const common = { address, internal: options.internal ?? false, mac: '00:00:00:00:00:00', cidr };
  return family === 'IPv4'
    ? { ...common, family, netmask: '255.255.255.0' }
    : { ...common, family, netmask: 'ffff:ffff:ffff:ffff::', scopeid: 0 };
}

const HOST: InterfaceSnapshot = {
  lo: [entry('127.0.0.1', '127.0.0.1/8', { internal: true })],
  docker0: [entry('172.17.0.1', '172.17.0.1/16')],
  wlp3s0: [
    entry('192.168.1.20', '192.168.1.20/24'),
    entry('fe80::1', 'fe80::1/64', { family: 'IPv6' }),
  ],
  enp2s0: [entry('10.0.0.5', '10.0.0.5/8')],
  stale: [entry('169.254.1.1', '169.254.1.1/16')],
  down: [entry('192.168.9.9', null)],
};

afterEach(() => {
  probe.outcome = 'error';
});

describe('the home LAN of this computer', () => {
  it('lists the external IPv4 networks with their prefix and CIDR', () => {
    expect(lanInterfaces(HOST)).toEqual([
      { name: 'docker0', address: '172.17.0.1', cidr: '172.17.0.1/16', prefix: 16 },
      { name: 'wlp3s0', address: '192.168.1.20', cidr: '192.168.1.20/24', prefix: 24 },
      { name: 'enp2s0', address: '10.0.0.5', cidr: '10.0.0.5/8', prefix: 8 },
    ]);
  });

  it('picks the Wi-Fi home address over wired, office and virtual ones when no route probes', async () => {
    expect(await homeLanAddress(HOST)).toBe('192.168.1.20');
  });

  it('prefers the address the default route leaves from', async () => {
    probe.outcome = '10.0.0.5';
    expect(await homeLanAddress(HOST)).toBe('10.0.0.5');
  });

  it('answers with nothing when the computer has no external IPv4 address', async () => {
    expect(await homeLanAddress({ lo: HOST['lo'] })).toBe('');
  });

  it('knows the private IPv4 ranges', () => {
    expect(['10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.0.1'].every(isPrivateIPv4)).toBe(
      true,
    );
    expect(['172.32.0.1', '100.64.0.1', '8.8.8.8'].some(isPrivateIPv4)).toBe(false);
  });

  it('flattens every address of every interface and finds one interface by name', () => {
    expect(interfaceEntries(HOST)).toHaveLength(7);
    expect(addressesOf(HOST, 'wlp3s0')).toEqual(['192.168.1.20', 'fe80::1']);
    expect(addressesOf(HOST, 'missing')).toEqual([]);
  });
});
