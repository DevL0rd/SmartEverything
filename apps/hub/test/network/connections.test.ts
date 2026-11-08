import type { AddressInfo } from 'node:net';
import { HUB_CONNECTION_METADATA } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HubConnections } from '../../src/network/connections';
import { testStore, type TestStore } from '../support/store';

const LISTENER: AddressInfo = { address: '0.0.0.0', family: 'IPv4', port: 8443 };

let opened: TestStore;
let connections: HubConnections;

beforeEach(async () => {
  opened = await testStore();
  connections = new HubConnections(
    {
      identity: {
        id: 'ab'.repeat(32),
        protocolVersion: 1,
        name: 'Home',
        tls: {
          serverName: `smarteverything-${'ab'.repeat(16)}.local`,
          certificateSha256: 'cd'.repeat(32),
          publicKeySha256: 'ab'.repeat(32),
        },
      },
      key: '',
      cert: '',
    },
    opened.store,
  );
});

afterEach(async () => {
  await opened.close();
});

describe('the endpoints the hub advertises to clients', () => {
  it('never include a loopback endpoint, before or after the LAN listener opens', () => {
    expect(connections.metadata().endpoints).toEqual([]);
    connections.listening(LISTENER);
    const { endpoints } = HUB_CONNECTION_METADATA.parse(connections.metadata());
    expect(endpoints.length).toBeGreaterThan(0);
    expect(endpoints.map((endpoint) => endpoint.kind)).not.toContain('loopback');
    expect(endpoints.every((endpoint) => new URL(endpoint.url).protocol === 'https:')).toBe(true);
  });

  it('advertise the public address once it is verified', () => {
    opened.store.settings.setPublicUrl('https://home.example.com');
    opened.store.settings.recordPublicUrlCheck('https://home.example.com', { verified: true });
    connections.listening(null);
    expect(connections.metadata().endpoints).toEqual([
      { kind: 'remote', url: 'https://home.example.com' },
    ]);
  });

  it('refuse a stored or received loopback endpoint at the schema', () => {
    const metadata = {
      ...connections.metadata(),
      endpoints: [{ kind: 'loopback', url: 'http://127.0.0.1:7880' }],
    };
    expect(HUB_CONNECTION_METADATA.safeParse(metadata).success).toBe(false);
  });
});
