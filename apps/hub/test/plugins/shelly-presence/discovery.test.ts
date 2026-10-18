import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  discoverShelly,
  watchShelly,
} from '../../../src/plugins/builtin/shelly-presence/discovery';
import { MemoryNetwork } from '../../support/memory-mdns';

function interfaces(address: string): void {
  vi.spyOn(os, 'networkInterfaces').mockReturnValue({
    eth0: [
      {
        address,
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: 'aa:bb:cc:dd:ee:ff',
        internal: false,
        cidr: `${address}/24`,
      },
    ],
  });
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closers.splice(0)) await close();
});

function sensor(network: MemoryNetwork, address: string): void {
  interfaces(address);
  const device = network.host(address)(() => undefined);
  closers.push(() => device.close());
  device.bonjour.publish({
    name: 'shelly-plug-aabbcc',
    type: 'shelly',
    port: 80,
    host: 'shelly-plug-aabbcc.local',
    probe: false,
    txt: { gen: '2' },
  });
}

describe('Shelly discovery over mDNS', () => {
  it('lists the sensors that answer during the scan', async () => {
    const network = new MemoryNetwork();
    sensor(network, '192.0.2.7');
    const scan = new AbortController();
    setTimeout(() => {
      scan.abort();
    }, 200);
    expect(await discoverShelly(scan.signal, network.host('192.0.2.2'))).toEqual({
      available: true,
      reason: null,
      candidates: [
        {
          name: 'shelly-plug-aabbcc',
          host: 'shelly-plug-aabbcc.local',
          address: 'http://192.0.2.7:80',
          generation: '2',
        },
      ],
    });
  });

  it('reports that scanning is unavailable when the network socket fails', async () => {
    const result = await discoverShelly(AbortSignal.timeout(100), (failed) => {
      const mdns = new MemoryNetwork().host('192.0.2.2')(failed);
      failed(new Error('socket closed'));
      return mdns;
    });
    expect(result.available).toBe(false);
    expect(result.reason).toContain('Local discovery unavailable');
  });

  it('keeps watching and reports each sensor that appears', async () => {
    const network = new MemoryNetwork();
    const seen: string[] = [];
    const stop = watchShelly(
      (candidate) => seen.push(candidate.address),
      () => undefined,
      network.host('192.0.2.2'),
    );
    closers.push(stop);
    sensor(network, '192.0.2.7');
    await vi.waitFor(() => {
      expect(seen).toEqual(['http://192.0.2.7:80']);
    });
  });
});
