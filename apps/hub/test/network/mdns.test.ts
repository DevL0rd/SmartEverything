import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  HubDiscoveryCandidate,
  HubDiscoveryStatus,
  HubIdentity,
} from '@smarteverything/domain';
import { findHubs } from '../../src/client-network/hub-discovery';
import { advertiseHub } from '../../src/network/mdns-advertise';
import { mdnsEmitter, watchServices, type FoundService } from '../../src/network/mdns';
import { testLogger } from '../support/logs';
import { MemoryNetwork } from '../support/memory-mdns';

const KEY = 'c'.repeat(64);
const IDENTITY: HubIdentity = {
  id: KEY,
  protocolVersion: 1,
  name: 'Test hub',
  tls: {
    serverName: `smarteverything-${'d'.repeat(32)}.local`,
    publicKeySha256: KEY,
    certificateSha256: 'e'.repeat(64),
  },
};
const LISTENER = { address: '0.0.0.0', family: 'IPv4', port: 8443 } as const;

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

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closers.splice(0).reverse()) await close();
});

function advertised(network: MemoryNetwork): {
  readonly statuses: HubDiscoveryStatus[];
  readonly networkChanged: ReturnType<typeof vi.fn>;
} {
  const statuses: HubDiscoveryStatus[] = [];
  const networkChanged = vi.fn();
  closers.push(
    advertiseHub({
      identity: IDENTITY,
      listener: LISTENER,
      log: testLogger('mdns'),
      changed: (status) => statuses.push(status),
      networkChanged,
      mdns: network.host('192.0.2.1'),
    }),
  );
  return { statuses, networkChanged };
}

function finder(network: MemoryNetwork): {
  readonly found: HubDiscoveryCandidate[];
  readonly lost: string[];
  readonly rediscover: () => void;
} {
  const found: HubDiscoveryCandidate[] = [];
  const lost: string[] = [];
  const mdns = network.host('192.0.2.2')(() => undefined);
  const watch = findHubs(mdns, {
    found: (_key, candidate) => found.push(candidate),
    lost: (key) => lost.push(key),
  });
  closers.push(async () => {
    watch.stop();
    await mdns.close();
  });
  return { found, lost, rediscover: watch.rediscover };
}

describe('hub advertisement and discovery', () => {
  it('advertises the encrypted listener and a browser that joins later finds it', async () => {
    interfaces('192.0.2.1');
    const network = new MemoryNetwork();
    const { statuses } = advertised(network);
    const { found } = finder(network);
    await vi.waitFor(() => {
      expect(found).toHaveLength(1);
    });
    expect(found[0]).toEqual({
      name: `Test hub ${KEY.slice(0, 8)}`,
      url: 'https://192.0.2.1:8443',
      hubId: KEY,
      protocolVersion: 1,
    });
    expect(statuses.at(-1)?.state).toBe('advertising');
  });

  it('republishes the new address when the network changes and withdraws on stop', async () => {
    interfaces('192.0.2.1');
    const network = new MemoryNetwork();
    const { statuses, networkChanged } = advertised(network);
    const { found, lost } = finder(network);
    await vi.waitFor(() => {
      expect(found).toHaveLength(1);
    });
    interfaces('192.0.2.9');
    const hub = network.opened[0];
    if (hub === undefined) throw new Error('hub session missing');
    network.changeNetwork(hub);
    await vi.waitFor(() => {
      expect(found.at(-1)?.url).toBe('https://192.0.2.9:8443');
    });
    expect(networkChanged).toHaveBeenCalledOnce();
    await closers.shift()?.();
    await vi.waitFor(() => {
      expect(lost).toHaveLength(2);
    });
    expect(statuses.at(-1)?.state).toBe('disabled');
  });

  it('ignores services that are not complete hub advertisements', async () => {
    interfaces('192.0.2.5');
    const network = new MemoryNetwork();
    const mdns = network.host('192.0.2.5')(() => undefined);
    closers.push(() => mdns.close());
    mdns.bonjour.publish({
      name: 'Other',
      type: 'smarteverything',
      port: 9,
      host: 'other.local',
      probe: false,
      txt: { id: KEY, protocol: '2', tls: '1' },
    });
    const { found } = finder(network);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(found).toEqual([]);
  });
});

describe('service watch', () => {
  it('reports a changed address after a goodbye and re-announce', async () => {
    interfaces('192.0.2.7');
    const network = new MemoryNetwork();
    const device = network.host('192.0.2.7')(() => undefined);
    closers.push(() => device.close());
    device.bonjour.publish({
      name: 'shelly-plug-aabbcc',
      type: 'shelly',
      port: 80,
      host: 'shelly-plug-aabbcc.local',
      probe: false,
      txt: { gen: '2' },
    });
    const observer = network.host('192.0.2.2')(() => undefined);
    const seen: FoundService[] = [];
    const watch = watchServices(observer, 'shelly', { found: (service) => seen.push(service) });
    closers.push(async () => {
      watch.stop();
      await observer.close();
    });
    await vi.waitFor(() => {
      expect(seen.at(-1)?.address).toBe('192.0.2.7');
    });
    expect(seen.at(-1)?.txt.get('gen')).toBe('2');
    interfaces('192.0.2.8');
    device.bonjour.unpublishAll();
    device.bonjour.publish({
      name: 'shelly-plug-aabbcc',
      type: 'shelly',
      port: 80,
      host: 'shelly-plug-aabbcc.local',
      probe: false,
      txt: { gen: '2' },
    });
    await vi.waitFor(() => {
      expect(seen.at(-1)?.address).toBe('192.0.2.8');
    });
  });

  it('reports a new address record for a service that never says goodbye', async () => {
    interfaces('192.0.2.7');
    const network = new MemoryNetwork();
    const device = network.host('192.0.2.7')(() => undefined);
    closers.push(() => device.close());
    device.bonjour.publish({
      name: 'shelly-plug-aabbcc',
      type: 'shelly',
      port: 80,
      host: 'shelly-plug-aabbcc.local',
      probe: false,
    });
    const observer = network.host('192.0.2.2')(() => undefined);
    const seen: FoundService[] = [];
    const watch = watchServices(observer, 'shelly', { found: (service) => seen.push(service) });
    closers.push(async () => {
      watch.stop();
      await observer.close();
    });
    await vi.waitFor(() => {
      expect(seen.at(-1)?.address).toBe('192.0.2.7');
    });
    mdnsEmitter(observer.bonjour).emit(
      'response',
      {
        answers: [{ name: 'shelly-plug-aabbcc.local', type: 'A', ttl: 120, data: '192.0.2.8' }],
        additionals: [],
      },
      { address: '192.0.2.8' },
    );
    expect(seen.at(-1)?.address).toBe('192.0.2.8');
  });
});
