import { COMPUTER_MCP_GRANT_RESPONSE, type ComputerNodeRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { manageComputerMcpGrant } from '../../src/computers/node-mcp-grant';
import { HubConnections } from '../../src/network/connections';
import { testStore, type TestStore } from '../support/store';

const HUB_ID = 'ab'.repeat(32);
const LAN_URL = 'https://192.168.50.2:7882';
const PUBLIC_URL = 'https://smarteverything.example.com';
const TOKEN = `scg_${'A'.repeat(43)}`;
const NODE: ComputerNodeRow = {
  device_id: '00000000-0000-4000-8000-000000000001',
  machine_id: 'f'.repeat(32),
  hub_url: LAN_URL,
  paired_at: '2026-11-07T10:00:00.000Z',
  revoked_at: null,
};

let opened: TestStore;
let connections: HubConnections;

beforeEach(async () => {
  opened = await testStore();
  connections = new HubConnections(
    {
      identity: {
        id: HUB_ID,
        protocolVersion: 1,
        name: 'Home',
        tls: {
          serverName: `smarteverything-${'ab'.repeat(16)}.local`,
          certificateSha256: 'cd'.repeat(32),
          publicKeySha256: HUB_ID,
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

function grantFor(node: ComputerNodeRow): ReturnType<typeof COMPUTER_MCP_GRANT_RESPONSE.parse> {
  return COMPUTER_MCP_GRANT_RESPONSE.parse(
    manageComputerMcpGrant(
      { store: opened.store, connections },
      node,
      { action: 'verify', token: TOKEN },
      'claude',
    ),
  );
}

describe('the address a native MCP grant carries', () => {
  it('is the verified public address when the computer was recorded with its LAN address', () => {
    opened.store.settings.setPublicUrl(PUBLIC_URL);
    opened.store.settings.recordPublicUrlCheck(PUBLIC_URL, { verified: true });
    const grant = grantFor(NODE);
    expect(grant.url).toBe(`${PUBLIC_URL}/mcp`);
    expect(grant.pin).toBeNull();
  });

  it('is the LAN address with the hub pin when the hub has no verified public address', () => {
    expect(grantFor(NODE)).toMatchObject({ url: `${LAN_URL}/mcp`, pin: HUB_ID });
    opened.store.settings.setPublicUrl(PUBLIC_URL);
    opened.store.settings.recordPublicUrlCheck(PUBLIC_URL, { verified: false, reason: 'offline' });
    expect(grantFor(NODE)).toMatchObject({ url: `${LAN_URL}/mcp`, pin: HUB_ID });
  });

  it('is never the recorded self-signed LAN address without its pin', () => {
    for (const verified of [false, true]) {
      opened.store.settings.setPublicUrl(verified ? PUBLIC_URL : null);
      if (verified) opened.store.settings.recordPublicUrlCheck(PUBLIC_URL, { verified });
      const grant = grantFor(NODE);
      expect(grant.url === `${LAN_URL}/mcp` && grant.pin === null).toBe(false);
    }
  });
});
