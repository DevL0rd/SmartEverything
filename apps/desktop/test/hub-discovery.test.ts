import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HubIdentity, NativeHubDiscovery } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { advertiseHub } from '../../hub/src/network/mdns-advertise';
import { MemoryNetwork } from '../../hub/test/support/memory-mdns';
import { HubDiscovery } from '../src/hub-network/discovery.js';

const KEY = 'c'.repeat(64);
const IDENTITY: HubIdentity = {
  id: KEY,
  protocolVersion: 1,
  name: 'Home',
  tls: {
    serverName: `smarteverything-${'d'.repeat(32)}.local`,
    publicKeySha256: KEY,
    certificateSha256: 'e'.repeat(64),
  },
};

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closers.splice(0).reverse()) await close();
});

function advertise(network: MemoryNetwork): () => Promise<void> {
  vi.spyOn(os, 'networkInterfaces').mockReturnValue({
    eth0: [
      {
        address: '192.0.2.1',
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: 'aa:bb:cc:dd:ee:ff',
        internal: false,
        cidr: '192.0.2.1/24',
      },
    ],
  });
  const stop = advertiseHub({
    identity: IDENTITY,
    listener: { address: '0.0.0.0', family: 'IPv4', port: 8443 },
    log: new Logger('desktop.test'),
    changed: () => undefined,
    mdns: network.host('192.0.2.1'),
  });
  closers.push(stop);
  return stop;
}

describe('nearby hub search', () => {
  it('lists a hub that answers, on any platform, and drops it when it leaves', async () => {
    const network = new MemoryNetwork();
    const states: NativeHubDiscovery[] = [];
    const discovery = new HubDiscovery((state) => states.push(state), network.host('192.0.2.2'));
    closers.push(() => {
      discovery.stop();
      return Promise.resolve();
    });
    expect(discovery.start()).toMatchObject({ state: 'searching', candidates: [] });
    const stop = advertise(network);
    await vi.waitFor(() => {
      expect(states.at(-1)?.candidates).toEqual([
        {
          name: `Home ${KEY.slice(0, 8)}`,
          url: 'https://192.0.2.1:8443',
          hubId: KEY,
          protocolVersion: 1,
        },
      ]);
    });
    await stop();
    await vi.waitFor(() => {
      expect(states.at(-1)?.candidates).toEqual([]);
    });
  });

  it('reports an idle search with no candidates after stopping', () => {
    const states: NativeHubDiscovery[] = [];
    const discovery = new HubDiscovery(
      (state) => states.push(state),
      new MemoryNetwork().host('192.0.2.2'),
    );
    discovery.start();
    discovery.stop();
    expect(states.at(-1)).toMatchObject({ state: 'idle', candidates: [] });
  });
});
