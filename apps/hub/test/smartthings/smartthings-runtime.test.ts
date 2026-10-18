import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AdapterFailure,
  AdapterSink,
  DeviceCommand,
  DeviceEvent,
  DiscoveredDevice,
  ProviderAdapter,
  StateUpdate,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { readWebhookMessage, type WebhookEventEntry } from '@smarteverything/smartthings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SmartThingsWebhooks } from '../../src/adapters/smartthings/webhooks';
import { TokenRefusedError } from '../../src/adapters/smartthings/tokens';
import { contextFor, FakeCloud, json, settle, type ContextRecord } from './fake-cloud';
import {
  accountWith,
  API,
  DEVICE_LIST_URL,
  LAMP,
  LOCATIONS,
  moduleWith,
  NOW,
  ROOMS,
  SENSOR,
  TOKEN_RESPONSE,
} from './fixtures';

let directory: string;
let record: ContextRecord;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  directory = await mkdtemp(join(tmpdir(), 'smartthings-runtime-'));
  record = contextFor(directory);
});

afterEach(async () => {
  vi.useRealTimers();
  Logger.reset();
  await rm(directory, { recursive: true, force: true });
});

function cloudWithDevices(): FakeCloud {
  const unknown = (): Response =>
    json({ error: { code: 'NotFoundError', message: 'Not found.' } }, 404);
  return new FakeCloud()
    .always('GET', `${API}/v1/locations`, () => json(LOCATIONS))
    .always('GET', `${API}/v1/locations/loc-1/rooms`, () => json(ROOMS))
    .always('GET', DEVICE_LIST_URL, () => json({ items: [LAMP, SENSOR] }))
    .always('GET', `${API}/v1/capabilities/switch/1`, unknown)
    .always('GET', `${API}/v1/capabilities/switchLevel/1`, unknown)
    .always('GET', `${API}/v1/capabilities/refresh/1`, unknown)
    .always('GET', `${API}/v1/capabilities/motionSensor/1`, unknown)
    .always('GET', `${API}/v1/capabilities/temperatureMeasurement/1`, unknown);
}

function start(
  cloud: FakeCloud,
  overrides: Record<string, string | null> = {},
  webhooks = new SmartThingsWebhooks(),
): Promise<ProviderAdapter> {
  const module = moduleWith({ fetch: cloud.fetch, now: () => new Date() }, webhooks);
  return module.start(accountWith(overrides), record.context);
}

interface SinkRecord {
  readonly sink: AdapterSink;
  readonly states: StateUpdate[];
  readonly events: DeviceEvent[];
  readonly devices: (readonly DiscoveredDevice[])[];
  readonly failures: AdapterFailure[];
  readonly onlines: (readonly [string, boolean])[];
}

function recordingSink(): SinkRecord {
  const states: StateUpdate[] = [];
  const events: DeviceEvent[] = [];
  const devices: (readonly DiscoveredDevice[])[] = [];
  const failures: AdapterFailure[] = [];
  const onlines: (readonly [string, boolean])[] = [];
  return {
    sink: {
      state: (update) => states.push(update),
      event: (event) => events.push(event),
      devices: (list) => devices.push(list),
      online: (externalId, online) => onlines.push([externalId, online]),
      failure: (failure) => failures.push(failure),
    },
    states,
    events,
    devices,
    failures,
    onlines,
  };
}

const LAMP_COMMAND: DeviceCommand = {
  commandId: '00000000-0000-4000-8000-000000000001',
  externalId: 'lamp-1',
  capability: 'power',
  value: true,
};

describe('SmartThings tokens', () => {
  it('refreshes an expired token before using it and saves the rotated tokens', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const cloud = cloudWithDevices().on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE));
    const adapter = await start(cloud, { expiresAt: '2026-10-08T11:00:00.000Z' });
    await adapter.discover();
    const [refresh] = cloud.sent('POST', `${API}/oauth/token`);
    expect(refresh?.body).toBe(
      'grant_type=refresh_token&client_id=client-1&refresh_token=refresh-1',
    );
    expect(cloud.sent('GET', `${API}/v1/locations`)[0]?.headers['authorization']).toBe(
      'Bearer access-2',
    );
    expect(record.saved.at(0)).toEqual({
      label: 'SmartThings: Home',
      secrets: {
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expiresAt: '2026-10-09T12:00:00.000Z',
        refreshedAt: '2026-10-08T12:00:00.000Z',
        scope: 'r:devices:* x:devices:* r:locations:*',
        installedAppId: 'app-1',
      },
    });
  });

  it('refreshes on its own twenty hours after the last refresh', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    const cloud = cloudWithDevices().on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE));
    await start(cloud);
    await vi.advanceTimersByTimeAsync(20 * 60 * 60 * 1000 - 1);
    expect(cloud.sent('POST', `${API}/oauth/token`)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(cloud.sent('POST', `${API}/oauth/token`)).toHaveLength(1);
    expect(record.logs.map((line) => line.event)).toContain('token.refreshed');
  });

  it('retries a refresh that failed for a reason other than refusal', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    const cloud = cloudWithDevices()
      .on('POST', `${API}/oauth/token`, () => json({ error: 'temporarily_unavailable' }, 503))
      .on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE));
    await start(cloud, { refreshedAt: '2026-10-07T00:00:00.000Z' });
    await vi.advanceTimersByTimeAsync(0);
    expect(record.logs.find((line) => line.event === 'token.refresh_failed')?.payload).toEqual({
      retryInMs: 300_000,
      reason:
        'SmartThingsHttpError: SmartThings answered POST /oauth/token with HTTP 503: HTTP 503 temporarily_unavailable.',
    });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(cloud.sent('POST', `${API}/oauth/token`)).toHaveLength(2);
    expect(record.attention).toEqual([]);
  });

  it('asks for attention and stops when SmartThings refuses the refresh token', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    const cloud = cloudWithDevices().always('POST', `${API}/oauth/token`, () =>
      json({ error: 'invalid_grant', error_description: 'Invalid refresh token: refresh-1' }, 400),
    );
    const adapter = await start(cloud, { refreshedAt: '2026-10-07T00:00:00.000Z' });
    await vi.advanceTimersByTimeAsync(0);
    expect(record.attention).toEqual([
      'SmartThings refused the token refresh: HTTP 400 invalid_grant: Invalid refresh token: refresh-1. Link SmartThings again.',
    ]);
    await expect(adapter.discover()).rejects.toThrow(TokenRefusedError);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(cloud.sent('POST', `${API}/oauth/token`)).toHaveLength(1);
  });

  it('refreshes once and retries when an access token is rejected', async () => {
    const cloud = cloudWithDevices()
      .on('GET', `${API}/v1/locations`, () =>
        json({ error: { code: 'Unauthorized', message: 'expired' } }, 401),
      )
      .on('POST', `${API}/oauth/token`, () => json(TOKEN_RESPONSE));
    const adapter = await start(cloud);
    expect((await adapter.discover()).map((device) => device.externalId)).toEqual([
      'lamp-1',
      'sensor-1',
    ]);
    expect(
      cloud.sent('GET', `${API}/v1/locations`).map((request) => request.headers['authorization']),
    ).toEqual(['Bearer access-1', 'Bearer access-2']);
  });
});

describe('the per-device rate limit', () => {
  it('holds the thirteenth request in a minute until the first leaves the window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    const cloud = cloudWithDevices().always('POST', `${API}/v1/devices/lamp-1/commands`, () =>
      json({ results: [{ id: 'c', status: 'ACCEPTED' }] }),
    );
    const adapter = await start(cloud);
    await adapter.discover();
    for (let sent = 0; sent < 12; sent += 1) {
      await adapter.execute(LAMP_COMMAND);
      await vi.advanceTimersByTimeAsync(1000);
    }
    const thirteenth = adapter.execute(LAMP_COMMAND);
    await vi.advanceTimersByTimeAsync(47_999);
    expect(cloud.sent('POST', `${API}/v1/devices/lamp-1/commands`)).toHaveLength(12);
    await vi.advanceTimersByTimeAsync(1);
    expect(await thirteenth).toEqual(['ACCEPTED']);
    expect(cloud.sent('POST', `${API}/v1/devices/lamp-1/commands`)).toHaveLength(13);
  });
});

const INSTALLED = `${API}/v1/installedapps/app-1`;

const SUBSCRIPTIONS = `${INSTALLED}/subscriptions`;

function subscribedCloud(existing: readonly unknown[] = []): FakeCloud {
  return cloudWithDevices()
    .always('GET', INSTALLED, () => json({ installedAppId: 'app-1', locationId: 'loc-1' }))
    .always('GET', SUBSCRIPTIONS, () => json({ items: existing }))
    .always('POST', SUBSCRIPTIONS, () => json({ id: 'created' }))
    .always('DELETE', `${SUBSCRIPTIONS}/stale-1`, () => json({ count: 1 }));
}

function eventsFor(events: readonly unknown[]): readonly WebhookEventEntry[] {
  const message = readWebhookMessage({
    lifecycle: 'EVENT',
    eventData: { installedApp: { installedAppId: 'app-1', locationId: 'loc-1' }, events },
  });
  return message.kind === 'event' ? message.events : [];
}

function deviceEvent(
  deviceId: string,
  capability: string,
  attribute: string,
  value: string,
): unknown {
  return {
    eventTime: '2025-10-08T12:00:00.000Z',
    eventType: 'DEVICE_EVENT',
    deviceEvent: { deviceId, componentId: 'main', capability, attribute, value, stateChange: true },
  };
}

function created(cloud: FakeCloud): readonly unknown[] {
  return cloud
    .sent('POST', SUBSCRIPTIONS)
    .map((request): unknown => JSON.parse(request.body ?? ''));
}

describe('SmartThings webhook events', () => {
  it('subscribes per capability for the installed app and routes webhook events into state and events', async () => {
    const cloud = subscribedCloud();
    const webhooks = new SmartThingsWebhooks();
    const adapter = await start(cloud, {}, webhooks);
    const recorded = recordingSink();
    const unsubscribe = await adapter.subscribe(recorded.sink);
    await settle();
    expect(
      created(cloud).map((body) => {
        const parsed = z
          .object({
            sourceType: z.string(),
            capability: z.object({ capability: z.string() }).optional(),
          })
          .parse(body);
        return parsed.capability?.capability ?? parsed.sourceType;
      }),
    ).toEqual([
      'DEVICE_LIFECYCLE',
      'DEVICE_HEALTH',
      'motionSensor',
      'refresh',
      'switch',
      'switchLevel',
      'temperatureMeasurement',
    ]);
    expect(created(cloud)[2]).toMatchObject({
      sourceType: 'CAPABILITY',
      capability: { locationId: 'loc-1', attribute: '*', value: '*', stateChangeOnly: true },
    });
    expect(record.logs.find((line) => line.event === 'events.subscribed')?.payload).toEqual({
      scheme: 'capability',
      subscriptions: 7,
      created: 7,
      removed: 0,
    });
    expect(
      recorded.states.map((state) => [state.externalId, state.capability, state.value]),
    ).toEqual([
      ['lamp-1', 'power', true],
      ['lamp-1', 'brightness', 40],
      ['sensor-1', 'motion', false],
    ]);

    expect(
      webhooks.deliver(
        'app-1',
        eventsFor([
          deviceEvent('lamp-1', 'switch', 'switch', 'off'),
          deviceEvent('sensor-1', 'motionSensor', 'motion', 'active'),
          deviceEvent('stranger', 'switch', 'switch', 'on'),
          {
            eventTime: '2025-10-08T12:00:00.000Z',
            eventType: 'DEVICE_HEALTH_EVENT',
            deviceHealthEvent: { deviceId: 'lamp-1', status: 'OFFLINE' },
          },
          {
            eventTime: 'never',
            eventType: 'DEVICE_EVENT',
            deviceEvent: {
              deviceId: 'lamp-1',
              componentId: 'main',
              capability: 'switch',
              attribute: 'switch',
              value: 'on',
            },
          },
          { eventType: 'MODE_EVENT' },
        ]),
      ),
    ).toBe(true);
    expect(recorded.states.slice(3)).toEqual([
      {
        externalId: 'lamp-1',
        capability: 'power',
        value: false,
        observedAt: '2025-10-08T12:00:00.000Z',
      },
      {
        externalId: 'sensor-1',
        capability: 'motion',
        value: true,
        observedAt: '2025-10-08T12:00:00.000Z',
      },
    ]);
    expect(recorded.events.map((event) => [event.externalId, event.kind])).toEqual([
      ['sensor-1', 'motion'],
    ]);
    expect(recorded.onlines).toEqual([['lamp-1', false]]);
    expect(recorded.failures.map((failure) => failure.operation)).toEqual(['events.read']);
    expect(record.logs.find((line) => line.event === 'events.ignored')?.payload).toEqual({
      eventType: 'MODE_EVENT',
    });

    webhooks.deliver(
      'app-1',
      eventsFor([
        {
          eventTime: '2025-10-08T12:00:00.000Z',
          eventType: 'DEVICE_LIFECYCLE_EVENT',
          deviceLifecycleEvent: { lifecycle: 'CREATE', deviceId: 'new-1' },
        },
      ]),
    );
    await vi.waitFor(() => {
      expect(cloud.sent('GET', SUBSCRIPTIONS)).toHaveLength(2);
    });
    expect(recorded.devices).toHaveLength(1);
    expect(record.logs.map((line) => line.event)).toContain('device.lifecycle_changed');

    await unsubscribe();
    expect(webhooks.deliver('app-1', [])).toBe(false);
    expect(record.attention).toEqual([]);
  });

  it('keeps the subscriptions that already exist and removes the stale ones', async () => {
    const cloud = subscribedCloud([
      { id: 'kept-1', sourceType: 'DEVICE_HEALTH', deviceHealth: { locationId: 'loc-1' } },
      {
        id: 'stale-1',
        sourceType: 'CAPABILITY',
        capability: { locationId: 'loc-1', capability: 'contactSensor' },
      },
    ]);
    const adapter = await start(cloud);
    await adapter.subscribe(recordingSink().sink);
    await settle();
    expect(cloud.sent('DELETE', `${SUBSCRIPTIONS}/stale-1`)).toHaveLength(1);
    expect(created(cloud)).toHaveLength(6);
    expect(
      created(cloud).map((body) => z.object({ sourceType: z.string() }).parse(body).sourceType),
    ).not.toContain('DEVICE_HEALTH');
  });

  it('says which devices it cannot hear when some are in another location', async () => {
    const cloud = subscribedCloud();
    cloud.always('GET', DEVICE_LIST_URL, () =>
      json({ items: [LAMP, { ...SENSOR, locationId: 'loc-2' }] }),
    );
    const adapter = await start(cloud);
    const recorded = recordingSink();
    await adapter.subscribe(recorded.sink);
    await settle();
    expect(recorded.failures.map((failure) => String(failure.cause))).toEqual([
      'SubscriptionsIncompleteError: SmartThings delivers only part of the events: no events for sensor-1, which are in another location than the one SmartThings was linked for.',
    ]);
  });

  it('tells the person, without retrying, when SmartThings refuses the subscriptions', async () => {
    const cloud = cloudWithDevices().always('GET', INSTALLED, () =>
      json(
        { requestId: 'r', error: { code: 'Forbidden', message: 'Access is denied.', details: [] } },
        403,
      ),
    );
    const adapter = await start(cloud);
    const recorded = recordingSink();
    await adapter.subscribe(recorded.sink);
    await settle();
    expect(record.attention).toEqual([
      'SmartThings refused the event subscriptions: HTTP 403 Forbidden: Access is denied..',
    ]);
    expect(recorded.failures.map((failure) => failure.operation)).toEqual(['events.subscribe']);
    const before = cloud.requests.length;
    await settle();
    expect(cloud.requests.length).toBe(before);
  });

  it('tells the person when the token carries no installed app to subscribe for', async () => {
    const adapter = await start(cloudWithDevices(), { installedAppId: null });
    await adapter.subscribe(recordingSink().sink);
    await settle();
    expect(record.attention).toEqual([
      'SmartThings refused the event subscriptions: the token response carried no installed_app_id, which the subscriptions need.',
    ]);
  });

  it('retries with growing pauses when SmartThings fails for a while, until it stops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    const cloud = subscribedCloud()
      .on('GET', INSTALLED, () => json({ error: { code: 'Gone', message: 'Later.' } }, 503))
      .on('GET', INSTALLED, () => json({ error: { code: 'Busy', message: 'Slow down.' } }, 429));
    const adapter = await start(cloud);
    const unsubscribe = await adapter.subscribe(recordingSink().sink);
    await settle();
    expect(cloud.sent('POST', SUBSCRIPTIONS)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(cloud.sent('POST', SUBSCRIPTIONS)).toHaveLength(7);
    expect(
      record.logs
        .filter((line) => line.event === 'events.subscribe_failed')
        .map((line) => line.payload['retryInMs']),
    ).toEqual([1000, 2000]);
    expect(record.attention).toEqual([]);
    await unsubscribe();
  });

  it('stops retrying once unsubscribed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    const cloud = subscribedCloud().on('GET', INSTALLED, () =>
      json({ error: { code: 'Gone', message: 'Later.' } }, 500),
    );
    const adapter = await start(cloud);
    const unsubscribe = await adapter.subscribe(recordingSink().sink);
    await settle();
    await unsubscribe();
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(cloud.sent('GET', INSTALLED)).toHaveLength(1);
  });

  it('stays quiet when the refresh token was refused, which already asked for attention', async () => {
    const cloud = subscribedCloud()
      .on('GET', INSTALLED, () => json({ error: { code: 'Unauthorized', message: 'x' } }, 401))
      .always('POST', `${API}/oauth/token`, () => json({ error: 'invalid_grant' }, 400));
    const adapter = await start(cloud);
    const recorded = recordingSink();
    await adapter.subscribe(recorded.sink);
    await settle();
    expect(record.attention).toEqual([
      'SmartThings refused the token refresh: HTTP 400 invalid_grant. Link SmartThings again.',
    ]);
    expect(recorded.failures).toEqual([]);
  });

  it('reads every page of the existing subscriptions', async () => {
    const cloud = subscribedCloud().on('GET', SUBSCRIPTIONS, () =>
      json({ items: [], _links: { next: { href: `${SUBSCRIPTIONS}?page=2` } } }),
    );
    cloud.always('GET', `${SUBSCRIPTIONS}?page=2`, () =>
      json({ items: [{ id: 'stale-1', sourceType: 'MODE' }] }),
    );
    const adapter = await start(cloud);
    await adapter.subscribe(recordingSink().sink);
    await settle();
    expect(cloud.sent('DELETE', `${SUBSCRIPTIONS}/stale-1`)).toHaveLength(1);
  });
});

describe('SmartThings edge cases', () => {
  it('keeps a status request between commands in order instead of batching across it', async () => {
    let answer: (response: Response) => void = () => undefined;
    const held = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const cloud = cloudWithDevices()
      .on('POST', `${API}/v1/devices/lamp-1/commands`, () => held)
      .always('POST', `${API}/v1/devices/lamp-1/commands`, () =>
        json({ results: [{ id: 'c', status: 'ACCEPTED' }] }),
      )
      .always('GET', `${API}/v1/devices/lamp-1/status`, () =>
        json({ components: { main: { switch: { switch: { value: 'on' } } } } }),
      );
    const adapter = await start(cloud);
    await adapter.discover();
    const first = adapter.execute(LAMP_COMMAND);
    await settle();
    const refreshed = adapter.refresh(['lamp-1']);
    const second = adapter.execute({ ...LAMP_COMMAND, value: false });
    answer(json({ results: [{ id: 'c', status: 'ACCEPTED' }] }));
    await Promise.all([first, refreshed, second]);
    const order = cloud.requests
      .filter((request) => request.url.includes('/v1/devices/lamp-1/'))
      .map((request) => `${request.method} ${request.url.replace(API, '')}`);
    expect(order).toEqual([
      'POST /v1/devices/lamp-1/commands',
      'GET /v1/devices/lamp-1/status',
      'POST /v1/devices/lamp-1/commands',
    ]);
  });

  it('reports an answer that is not JSON', async () => {
    const cloud = cloudWithDevices().on(
      'GET',
      `${API}/v1/locations`,
      () => new Response('<html>', { status: 200 }),
    );
    const adapter = await start(cloud);
    await expect(adapter.discover()).rejects.toThrow(
      /^SmartThings answered READ .* with HTTP 200: not JSON: SyntaxError/,
    );
  });
});
