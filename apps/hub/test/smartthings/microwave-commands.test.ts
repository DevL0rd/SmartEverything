import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeviceCommand, ProviderAdapter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextFor, FakeCloud, json } from './fake-cloud';
import {
  accountWith,
  API,
  DEVICE_LIST_URL,
  LOCATIONS,
  moduleWith,
  NOW,
  ROOMS,
  TOKEN_RESPONSE,
} from './fixtures';

const COMMANDS = `${API}/v1/devices/oven-1/commands`;
const STOP: DeviceCommand = {
  commandId: '00000000-0000-4000-8000-000000000002',
  externalId: 'oven-1',
  capability: 'raw:samsungce.oven_operating_state:stop',
  value: null,
};

function microwave(remote: string): Readonly<Record<string, unknown>> {
  return {
    deviceId: 'oven-1',
    label: 'Microwave',
    manufacturerName: 'Samsung Electronics',
    locationId: 'loc-1',
    components: [
      {
        id: 'main',
        categories: [{ name: 'Microwave', categoryType: 'manufacturer' }],
        capabilities: [
          {
            id: 'samsungce.kitchenDeviceIdentification',
            version: 1,
            status: { type: { value: 'microwave' } },
          },
          {
            id: 'remoteControlStatus',
            version: 1,
            status: { remoteControlEnabled: { value: remote } },
          },
          { id: 'samsungce.ovenOperatingState', version: 1 },
        ],
      },
    ],
    healthState: { state: 'ONLINE' },
  };
}

const OVEN_STATE = {
  id: 'samsungce.ovenOperatingState',
  version: 1,
  status: 'live',
  name: 'Oven operating state',
  attributes: {},
  commands: { stop: { name: 'stop', arguments: [] } },
};

let directory: string;
let adapter: ProviderAdapter;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  directory = await mkdtemp(join(tmpdir(), 'smartthings-microwave-'));
});

afterEach(async () => {
  vi.useRealTimers();
  Logger.reset();
  await rm(directory, { recursive: true, force: true });
});

async function started(remote: string, cloud: FakeCloud): Promise<FakeCloud> {
  const unknown = (): Response =>
    json({ error: { code: 'NotFoundError', message: 'Not found.' } }, 404);
  cloud
    .always('GET', `${API}/v1/locations`, () => json(LOCATIONS))
    .always('GET', `${API}/v1/locations/loc-1/rooms`, () => json(ROOMS))
    .always('GET', DEVICE_LIST_URL, () => json({ items: [microwave(remote)] }))
    .always('GET', `${API}/v1/capabilities/samsungce.kitchenDeviceIdentification/1`, unknown)
    .always('GET', `${API}/v1/capabilities/remoteControlStatus/1`, unknown)
    .always('GET', `${API}/v1/capabilities/samsungce.ovenOperatingState/1`, () => json(OVEN_STATE));
  const module = moduleWith({ fetch: cloud.fetch, now: () => new Date() });
  adapter = await module.start(accountWith(), contextFor(directory).context);
  await adapter.discover();
  return cloud;
}

describe('microwave commands', () => {
  it('refuses once, before anything is sent, and says what to fix', async () => {
    const cloud = await started('false', new FakeCloud());
    await expect(adapter.execute(STOP)).rejects.toThrow('Turn on remote control on the microwave.');
    expect(cloud.sent('POST', COMMANDS)).toHaveLength(0);
  });

  it('sends the command it checked, once', async () => {
    const cloud = await started(
      'true',
      new FakeCloud().always('POST', COMMANDS, () =>
        json({ results: [{ id: 'c', status: 'ACCEPTED' }] }),
      ),
    );
    expect(await adapter.execute(STOP)).toEqual(['ACCEPTED']);
    const [sent] = cloud.sent('POST', COMMANDS);
    expect(JSON.parse(sent?.body ?? '')).toEqual({
      commands: [
        { component: 'main', capability: 'samsungce.ovenOperatingState', command: 'stop' },
      ],
    });
  });

  it('resends the same body after a token refresh without checking again', async () => {
    const cloud = await started(
      'true',
      new FakeCloud()
        .on('POST', COMMANDS, () => json({ error: { code: 'Unauthorized' } }, 401))
        .on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE))
        .always('POST', COMMANDS, () => json({ results: [{ id: 'c', status: 'ACCEPTED' }] })),
    );
    expect(await adapter.execute(STOP)).toEqual(['ACCEPTED']);
    const [first, second] = cloud.sent('POST', COMMANDS);
    expect(second?.body).toBe(first?.body);
    expect(second?.headers['authorization']).toBe('Bearer access-2');
  });
});
