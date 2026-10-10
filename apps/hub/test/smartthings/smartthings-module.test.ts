import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandRefusedError,
  type CapabilityKey,
  type ProviderAdapter,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SmartThingsCommandFailedError } from '../../src/adapters/smartthings/adapter';
import { createSmartThingsModule } from '../../src/adapters/smartthings/index';
import { SmartThingsWebhooks } from '../../src/adapters/smartthings/webhooks';
import { UnknownDeviceError } from '../../src/adapters/smartthings/inventory';
import { SmartThingsLinkError } from '../../src/adapters/smartthings/link';
import { Clock, contextFor, FakeCloud, json, type ContextRecord } from './fake-cloud';
import {
  accountWith,
  API,
  DEVICE_LIST_URL,
  LAMP,
  LOCATIONS,
  moduleWith,
  NOW,
  REFRESH_DEFINITION,
  ROOMS,
  SENSOR,
  TOKEN_RESPONSE,
} from './fixtures';

let directory: string;
let record: ContextRecord;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'smartthings-test-'));
  record = contextFor(directory);
});

afterEach(async () => {
  Logger.reset();
  await rm(directory, { recursive: true, force: true });
});

function notFound(): Response {
  return json(
    { requestId: 'r', error: { code: 'NotFoundError', message: 'Not found.', details: [] } },
    404,
  );
}

export function inventoryCloud(): FakeCloud {
  return new FakeCloud()
    .always('GET', `${API}/v1/locations`, () => json(LOCATIONS))
    .always('GET', `${API}/v1/locations/loc-1/rooms`, () => json(ROOMS))
    .always('GET', DEVICE_LIST_URL, () =>
      json({
        items: [LAMP, { deviceId: 'broken' }],
        _links: { next: { href: `${API}/v1/devices?page=2` } },
      }),
    )
    .always('GET', `${API}/v1/devices?page=2`, () => json({ items: [SENSOR], _links: {} }))
    .always('GET', `${API}/v1/capabilities/refresh/1`, () => json(REFRESH_DEFINITION))
    .always('GET', `${API}/v1/capabilities/switch/1`, notFound)
    .always('GET', `${API}/v1/capabilities/switchLevel/1`, notFound)
    .always('GET', `${API}/v1/capabilities/motionSensor/1`, notFound)
    .always('GET', `${API}/v1/capabilities/temperatureMeasurement/1`, notFound);
}

async function start(cloud: FakeCloud, account = accountWith()): Promise<ProviderAdapter> {
  const module = moduleWith({
    fetch: cloud.fetch,
    now: new Clock(NOW).now,
  });
  return module.start(account, record.context);
}

describe('linking SmartThings', () => {
  it('exchanges the code with HTTP Basic client authentication and names the account after its locations', async () => {
    const cloud = new FakeCloud()
      .on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE))
      .on('GET', `${API}/v1/locations`, () =>
        json({
          items: [
            { locationId: 'l1', name: 'Home' },
            { locationId: 'l2', name: 'Cabin' },
          ],
        }),
      );
    const module = moduleWith({
      fetch: cloud.fetch,
      now: new Clock(NOW).now,
    });
    const account = await module.link(
      {
        provider: 'smartthings',
        code: 'code-1',
        redirectUri: 'https://cb.test/cb',
      },
      record.context,
    );
    expect(account).toEqual({
      label: 'SmartThings: Home, Cabin',
      secrets: {
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expiresAt: '2026-10-09T12:00:00.000Z',
        refreshedAt: '2026-10-08T12:00:00.000Z',
        scope: 'r:devices:* x:devices:* r:locations:*',
        installedAppId: 'app-1',
      },
    });
    const [exchange, locations] = cloud.requests;
    expect(exchange?.headers['authorization']).toBe(
      `Basic ${Buffer.from('client-1:secret-1').toString('base64')}`,
    );
    expect(exchange?.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(exchange?.body).toBe(
      'grant_type=authorization_code&client_id=client-1&code=code-1&redirect_uri=https%3A%2F%2Fcb.test%2Fcb',
    );
    expect(locations?.headers['authorization']).toBe('Bearer access-2');
    expect(record.logs.map((line) => line.event)).toContain('account.linked');
    expect(JSON.stringify(record.logs)).not.toContain('access-2');
  });

  it('reports a refused code with the OAuth error', async () => {
    const cloud = new FakeCloud().always('POST', `${API}/oauth/token`, () =>
      json({ error: 'invalid_grant', error_description: 'Invalid authorization code' }, 400),
    );
    const module = moduleWith({
      fetch: cloud.fetch,
      now: new Clock(NOW).now,
    });
    const linking = module.link(
      { provider: 'smartthings', code: 'x', redirectUri: 'https://edge.test/cb' },
      record.context,
    );
    await expect(linking).rejects.toThrow(SmartThingsLinkError);
    await expect(
      module.link(
        { provider: 'smartthings', code: 'x', redirectUri: 'https://edge.test/cb' },
        record.context,
      ),
    ).rejects.toThrow(
      'Linking SmartThings failed while exchanging the authorization code: HTTP 400 invalid_grant: Invalid authorization code.',
    );
  });

  it('reports a location list it cannot read', async () => {
    const cloud = new FakeCloud()
      .on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE))
      .on('GET', `${API}/v1/locations`, () =>
        json({ requestId: 'r', error: { code: 'Forbidden', message: 'No.' } }, 403),
      )
      .on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE))
      .on('GET', `${API}/v1/locations`, () => json({ nothing: true }));
    const module = moduleWith({
      fetch: cloud.fetch,
      now: new Clock(NOW).now,
    });
    const credentials = {
      provider: 'smartthings',
      code: 'x',
      redirectUri: 'https://edge.test/cb',
    } as const;
    await expect(module.link(credentials, record.context)).rejects.toThrow(
      'Linking SmartThings failed while reading the locations: HTTP 403 Forbidden: No..',
    );
    await expect(module.link(credentials, record.context)).rejects.toThrow(
      /^Linking SmartThings failed while reading the locations: \[/,
    );
  });

  it('reads the app client id and secret only when it needs them', async () => {
    const cloud = new FakeCloud().on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE));
    let calls = 0;
    const module = createSmartThingsModule({
      app: () => {
        calls += 1;
        throw new Error('no app saved');
      },
      webhooks: new SmartThingsWebhooks(),
      io: { fetch: cloud.fetch, now: new Clock(NOW).now },
    });
    expect(calls).toBe(0);
    await expect(
      module.link(
        { provider: 'smartthings', code: 'x', redirectUri: 'https://x.test/cb' },
        record.context,
      ),
    ).rejects.toThrow('no app saved');
    expect(calls).toBe(1);
    expect(cloud.requests).toEqual([]);
  });
});

describe('the SmartThings inventory', () => {
  it('lists every device across pages, with rooms, and reports the ones it could not read', async () => {
    const cloud = inventoryCloud();
    const adapter = await start(cloud);
    const devices = await adapter.discover();
    expect(
      devices.map((device) => [
        device.externalId,
        device.kind,
        device.room,
        device.capabilities.map((c) => c.key),
      ]),
    ).toEqual([
      ['lamp-1', 'light', 'Lounge', ['power', 'brightness', 'raw:refresh:refresh']],
      ['sensor-1', 'sensor', null, ['temperature', 'motion']],
    ]);
    expect(cloud.sent('GET', DEVICE_LIST_URL)[0]?.headers['accept']).toBe(
      'application/vnd.smartthings+json;v=20170916',
    );
    expect(cloud.sent('GET', DEVICE_LIST_URL)[0]?.headers['authorization']).toBe('Bearer access-1');
    expect(record.logs.filter((line) => line.event === 'device.rejected')).toHaveLength(1);
    expect(
      record.logs.filter((line) => line.event === 'capability.definition_unavailable'),
    ).toHaveLength(4);
  });

  it('caches capability definitions on disk and reads them back on the next start', async () => {
    const first = inventoryCloud();
    await (await start(first)).discover();
    expect(await readdir(join(directory, 'capabilities'))).toEqual(['refresh%401.json']);
    const second = inventoryCloud();
    await (await start(second)).discover();
    expect(second.sent('GET', `${API}/v1/capabilities/refresh/1`)).toHaveLength(0);
    expect(second.sent('GET', `${API}/v1/capabilities/switch/1`)).toHaveLength(1);
  });

  it('reads the device status on refresh', async () => {
    const cloud = inventoryCloud().always('GET', `${API}/v1/devices/lamp-1/status`, () =>
      json({
        components: {
          main: { switch: { switch: { value: 'off' } }, switchLevel: { level: { value: 5 } } },
        },
      }),
    );
    const adapter = await start(cloud);
    expect(await adapter.refresh(['lamp-1'])).toEqual([
      {
        externalId: 'lamp-1',
        capability: 'power',
        value: false,
        observedAt: '2026-10-08T12:00:00.000Z',
      },
      {
        externalId: 'lamp-1',
        capability: 'brightness',
        value: 5,
        observedAt: '2026-10-08T12:00:00.000Z',
      },
    ]);
    await expect(adapter.refresh(['ghost'])).rejects.toThrow(UnknownDeviceError);
  });
});

describe('SmartThings commands', () => {
  it('sends the commands a capability needs to its device and returns their status', async () => {
    const cloud = inventoryCloud().on('POST', `${API}/v1/devices/lamp-1/commands`, () =>
      json({ results: [{ id: 'c1', status: 'ACCEPTED' }] }),
    );
    const adapter = await start(cloud);
    const result = await adapter.execute({
      commandId: '00000000-0000-4000-8000-000000000001',
      externalId: 'lamp-1',
      capability: 'brightness',
      value: 70,
    });
    expect(result).toEqual(['ACCEPTED']);
    const [post] = cloud.sent('POST', `${API}/v1/devices/lamp-1/commands`);
    expect(JSON.parse(post?.body ?? '')).toEqual({
      commands: [
        { component: 'main', capability: 'switchLevel', command: 'setLevel', arguments: [70] },
      ],
    });
    expect(post?.headers['content-type']).toBe('application/json');
  });

  it('fails a command SmartThings reports as failed', async () => {
    const cloud = inventoryCloud().on('POST', `${API}/v1/devices/lamp-1/commands`, () =>
      json({ results: [{ id: 'c1', status: 'FAILED' }] }),
    );
    const adapter = await start(cloud);
    await expect(
      adapter.execute({
        commandId: '00000000-0000-4000-8000-000000000001',
        externalId: 'lamp-1',
        capability: 'power',
        value: true,
      }),
    ).rejects.toThrow(new SmartThingsCommandFailedError('lamp-1', 'power'));
  });

  it('refuses capabilities the device lacks or that can only be read', async () => {
    const adapter = await start(inventoryCloud());
    const base = { commandId: '00000000-0000-4000-8000-000000000001', externalId: 'sensor-1' };
    await expect(adapter.execute({ ...base, capability: 'motion', value: true })).rejects.toThrow(
      new CommandRefusedError('motion', 'it can only be read'),
    );
    await expect(adapter.execute({ ...base, capability: 'power', value: true })).rejects.toThrow(
      new CommandRefusedError('power', 'the device does not have it'),
    );
  });

  it('reports the SmartThings error when a command is rejected', async () => {
    const cloud = inventoryCloud().on('POST', `${API}/v1/devices/lamp-1/commands`, () =>
      json(
        {
          requestId: 'r',
          error: {
            code: 'ConstraintViolationError',
            message: 'The request is malformed.',
            details: [],
          },
        },
        422,
      ),
    );
    const adapter = await start(cloud);
    await expect(
      adapter.execute({
        commandId: '00000000-0000-4000-8000-000000000001',
        externalId: 'lamp-1',
        capability: 'power',
        value: true,
      }),
    ).rejects.toThrow(
      'SmartThings answered POST /v1/devices/lamp-1/commands with HTTP 422: ConstraintViolationError: The request is malformed..',
    );
  });

  it('batches commands that wait for the same device into one request', async () => {
    let answer: (response: Response) => void = () => undefined;
    const reply = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const cloud = inventoryCloud()
      .on('POST', `${API}/v1/devices/lamp-1/commands`, () => reply)
      .on('POST', `${API}/v1/devices/lamp-1/commands`, () =>
        json({
          results: [
            { id: 'c2', status: 'ACCEPTED' },
            { id: 'c3', status: 'COMPLETED' },
          ],
        }),
      );
    const adapter = await start(cloud);
    await adapter.discover();
    const command = (capability: CapabilityKey, value: boolean | number): Promise<unknown> =>
      adapter.execute({
        commandId: '00000000-0000-4000-8000-000000000001',
        externalId: 'lamp-1',
        capability,
        value,
      });
    const first = command('power', true);
    await new Promise((resolve) => setImmediate(resolve));
    const second = command('brightness', 10);
    const third = command('power', false);
    await new Promise((resolve) => setImmediate(resolve));
    answer(json({ results: [{ id: 'c1', status: 'ACCEPTED' }] }));
    expect(await Promise.all([first, second, third])).toEqual([
      ['ACCEPTED'],
      ['ACCEPTED'],
      ['COMPLETED'],
    ]);
    const posts = cloud
      .sent('POST', `${API}/v1/devices/lamp-1/commands`)
      .map((post): unknown => JSON.parse(post.body ?? ''));
    expect(posts).toEqual([
      { commands: [{ component: 'main', capability: 'switch', command: 'on' }] },
      {
        commands: [
          { component: 'main', capability: 'switchLevel', command: 'setLevel', arguments: [10] },
          { component: 'main', capability: 'switch', command: 'off' },
        ],
      },
    ]);
  });
});
