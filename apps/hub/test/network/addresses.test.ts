import type { AddressInfo } from 'node:net';
import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanEndpoints } from '../../src/network/addresses';

const listener: AddressInfo = { address: '0.0.0.0', family: 'IPv4', port: 8443 };

function entry(address: string): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: `${address}/24`,
  };
}

describe('lanEndpoints', () => {
  it('lists each usable address once', () => {
    const endpoints = lanEndpoints(listener, {
      eth0: [entry('192.168.1.5'), entry('192.168.1.5'), entry('10.0.0.2')],
    });
    expect(endpoints.map(({ url }) => url)).toEqual([
      'https://192.168.1.5:8443',
      'https://10.0.0.2:8443',
    ]);
  });

  it('caps the list at 29 so the pairing payload stays within 32 endpoints', () => {
    const addresses = Array.from({ length: 40 }, (_, index) =>
      entry(`10.1.0.${String(index + 1)}`),
    );
    expect(lanEndpoints(listener, { br0: addresses })).toHaveLength(29);
  });
});
