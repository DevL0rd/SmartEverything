import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrinterDiscovery, type Candidate } from '../../../src/plugins/builtin/printer/discovery';
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

const closers: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closers.splice(0).reverse()) await close();
});

interface Advert {
  readonly name: string;
  readonly type: 'ipp' | 'ipps';
  readonly txt: Record<string, string>;
}

function printer(network: MemoryNetwork, adverts: readonly Advert[]): void {
  const mdns = network.host('192.0.2.7')(() => undefined);
  closers.push(() => mdns.close());
  for (const advert of adverts) {
    mdns.bonjour.publish({
      name: advert.name,
      type: advert.type,
      port: advert.type === 'ipps' ? 443 : 631,
      host: 'laserjet.local',
      probe: false,
      txt: advert.txt,
    });
  }
}

function finder(network: MemoryNetwork): {
  readonly discovery: PrinterDiscovery;
  readonly found: Candidate[];
  readonly lost: Candidate[];
} {
  const found: Candidate[] = [];
  const lost: Candidate[] = [];
  const discovery = new PrinterDiscovery(
    network.host('192.0.2.2'),
    {
      found: (candidate): void => {
        found.push(candidate);
      },
      lost: (candidate): void => {
        lost.push(candidate);
      },
    },
    () => undefined,
  );
  discovery.start();
  closers.push(() => discovery.stop());
  return { discovery, found, lost };
}

const UUID = '0b0c0d0e-1111-2222-3333-444455556666';

describe('printer discovery', () => {
  it('finds an IPP printer with its model, note and address', async () => {
    interfaces('192.0.2.7');
    const network = new MemoryNetwork();
    printer(network, [
      {
        name: 'Hall LaserJet',
        type: 'ipp',
        txt: {
          rp: 'ipp/print',
          ty: 'HP LaserJet 400',
          note: 'Hall',
          adminurl: 'http://hall.local/',
          UUID: `urn:uuid:${UUID.toUpperCase()}`,
        },
      },
    ]);
    const { discovery, found } = finder(network);
    await vi.waitFor(() => {
      expect(found).toHaveLength(1);
    });
    expect(found[0]).toMatchObject({
      uuid: UUID,
      key: UUID,
      name: 'Hall LaserJet',
      model: 'HP LaserJet 400',
      location: 'Hall',
      uri: 'ipp://192.0.2.7:631/ipp/print',
      secure: false,
      authentication: false,
      adminUrl: 'http://hall.local/',
    });
    expect(discovery.candidates()).toHaveLength(1);
  });

  it('prefers the encrypted advert of the same printer over the plain one', async () => {
    interfaces('192.0.2.7');
    const network = new MemoryNetwork();
    const txt = { rp: 'ipp/print', UUID: UUID, air: 'username,password' };
    printer(network, [
      { name: 'Hall LaserJet', type: 'ipps', txt },
      { name: 'Hall LaserJet', type: 'ipp', txt },
    ]);
    const { discovery, found } = finder(network);
    await vi.waitFor(() => {
      expect(found.some((candidate) => candidate.secure)).toBe(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const [only] = discovery.candidates();
    expect(discovery.candidates()).toHaveLength(1);
    expect(only).toMatchObject({
      secure: true,
      authentication: true,
      uri: 'ipps://192.0.2.7:443/ipp/print',
    });
  });

  it('ignores a service without a resource path and rescans on request', async () => {
    interfaces('192.0.2.7');
    const network = new MemoryNetwork();
    printer(network, [{ name: 'Broken', type: 'ipp', txt: { ty: 'x' } }]);
    const { discovery, found } = finder(network);
    await new Promise((resolve) => setTimeout(resolve, 150));
    discovery.rescan();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(found).toStrictEqual([]);
    expect(discovery.candidates()).toStrictEqual([]);
  });

  it('reports a printer that went away', async () => {
    interfaces('192.0.2.7');
    const network = new MemoryNetwork();
    printer(network, [{ name: 'Hall', type: 'ipp', txt: { rp: 'ipp/print', UUID: UUID } }]);
    const { found, lost } = finder(network);
    await vi.waitFor(() => {
      expect(found).toHaveLength(1);
    });
    const device = network.opened[0];
    if (device === undefined) throw new Error('printer host missing');
    device.bonjour.unpublishAll();
    await vi.waitFor(() => {
      expect(lost).toHaveLength(1);
    });
    expect(lost[0]?.uuid).toBe(UUID);
  });
});
