import { describe, expect, it } from 'vitest';
import {
  INSTALLED_APP,
  INSTALLED_SUBSCRIPTION_LIST,
  LOCATION_SUBSCRIPTIONS,
  planSubscriptions,
  reconcileSubscriptions,
  SUBSCRIPTION_BUDGET,
  SUBSCRIPTION_LIMIT,
  type InstalledSubscription,
  type SubscribedDevice,
  type SubscriptionRequest,
} from '../src/subscriptions';

const HOME = 'loc-1';

function device(
  deviceId: string,
  capabilities: readonly string[],
  locationId = HOME,
): SubscribedDevice {
  return { deviceId, locationId, capabilities };
}

function unnamed(request: SubscriptionRequest | undefined): unknown {
  return JSON.parse(JSON.stringify(request ?? null).replace(/"se_[0-9a-f]{16}"/g, '"NAME"'));
}

function capabilitiesOf(requests: readonly SubscriptionRequest[]): readonly string[] {
  return requests.flatMap((request) =>
    request.sourceType === 'CAPABILITY' ? [request.capability.capability] : [],
  );
}

function devicesOf(requests: readonly SubscriptionRequest[]): readonly string[] {
  return requests.flatMap((request) =>
    request.sourceType === 'DEVICE' ? [request.device.deviceId] : [],
  );
}

function namesOf(requests: readonly SubscriptionRequest[]): readonly string[] {
  return requests.map((request) => {
    switch (request.sourceType) {
      case 'CAPABILITY':
        return request.capability.subscriptionName;
      case 'DEVICE':
        return request.device.subscriptionName;
      case 'DEVICE_LIFECYCLE':
        return request.deviceLifecycle.subscriptionName;
      case 'DEVICE_HEALTH':
        return request.deviceHealth.subscriptionName;
    }
  });
}

function numbered(prefix: string, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(2, '0')}`);
}

describe('the subscription limits', () => {
  it('keeps two of the forty subscriptions for lifecycle and health', () => {
    expect(SUBSCRIPTION_LIMIT).toBe(40);
    expect(LOCATION_SUBSCRIPTIONS).toBe(2);
    expect(SUBSCRIPTION_BUDGET).toBe(38);
  });
});

describe('planning subscriptions', () => {
  it('names each subscription after a hash of what it delivers', () => {
    const byCapability = planSubscriptions(HOME, [device('lamp-1', ['switch'])]);
    expect(namesOf(byCapability.requests)).toEqual([
      'se_02637f38463c2fd5',
      'se_d852b2f6f870ddb9',
      'se_e8203d6b910a7b88',
    ]);
    const byDevice = planSubscriptions(HOME, [
      device('lamp-1', numbered('cap', SUBSCRIPTION_BUDGET + 1)),
    ]);
    expect(namesOf(byDevice.requests)[2]).toBe('se_77c0001ed0b86cd2');
  });

  it('subscribes per capability across the location, most widely used first', () => {
    const plan = planSubscriptions(HOME, [
      device('lamp-1', ['switch', 'switchLevel', 'refresh']),
      device('lamp-2', ['switch', 'refresh', 'switch']),
      device('sensor-1', ['motionSensor', 'battery']),
    ]);
    expect(plan.scheme).toBe('capability');
    expect(plan.uncoveredCapabilities).toEqual([]);
    expect(plan.otherLocationDevices).toEqual([]);
    expect(plan.requests.slice(0, 2).map(unnamed)).toEqual([
      {
        sourceType: 'DEVICE_LIFECYCLE',
        deviceLifecycle: { locationId: HOME, subscriptionName: 'NAME' },
      },
      {
        sourceType: 'DEVICE_HEALTH',
        deviceHealth: { locationId: HOME, subscriptionName: 'NAME' },
      },
    ]);
    expect(capabilitiesOf(plan.requests)).toEqual([
      'refresh',
      'switch',
      'battery',
      'motionSensor',
      'switchLevel',
    ]);
    expect(unnamed(plan.requests[2])).toEqual({
      sourceType: 'CAPABILITY',
      capability: {
        locationId: HOME,
        capability: 'refresh',
        attribute: '*',
        value: '*',
        stateChangeOnly: true,
        subscriptionName: 'NAME',
      },
    });
  });

  it('names each subscription uniquely and the same way every time', () => {
    const devices = [device('lamp-1', ['switch', 'switchLevel'])];
    const first = namesOf(planSubscriptions(HOME, devices).requests);
    expect(new Set(first).size).toBe(first.length);
    expect(namesOf(planSubscriptions(HOME, devices).requests)).toEqual(first);
    expect(
      namesOf(
        planSubscriptions(
          'loc-2',
          devices.map((d) => ({ ...d, locationId: 'loc-2' })),
        ).requests,
      ),
    ).not.toEqual(first);
    for (const name of first) {
      expect(name).toMatch(/^se_[0-9a-f]{16}$/);
    }
  });

  it('subscribes per device when the location has more capabilities than fit but few devices', () => {
    const capabilities = numbered('cap', SUBSCRIPTION_BUDGET + 1);
    const devices = [...numbered('device-', SUBSCRIPTION_BUDGET)]
      .reverse()
      .map((deviceId) => device(deviceId, capabilities));
    const plan = planSubscriptions(HOME, devices);
    expect(plan.scheme).toBe('device');
    expect(plan.requests).toHaveLength(SUBSCRIPTION_LIMIT);
    expect(devicesOf(plan.requests)).toEqual(numbered('device-', SUBSCRIPTION_BUDGET));
    expect(unnamed(plan.requests[2])).toEqual({
      sourceType: 'DEVICE',
      device: {
        deviceId: 'device-00',
        componentId: '*',
        capability: '*',
        attribute: '*',
        value: '*',
        stateChangeOnly: true,
        subscriptionName: 'NAME',
      },
    });
    expect(plan.uncoveredCapabilities).toEqual([]);
  });

  it('keeps per capability while exactly the budget of capabilities exists', () => {
    const capabilities = numbered('cap', SUBSCRIPTION_BUDGET);
    const plan = planSubscriptions(HOME, [device('device-1', capabilities)]);
    expect(plan.scheme).toBe('capability');
    expect(plan.requests).toHaveLength(SUBSCRIPTION_LIMIT);
    expect(plan.uncoveredCapabilities).toEqual([]);
  });

  it('covers the most widely used capabilities and names the rest when neither scheme fits', () => {
    const shared = numbered('shared', SUBSCRIPTION_BUDGET);
    const devices = numbered('device-', SUBSCRIPTION_BUDGET + 1).map((deviceId, index) =>
      device(deviceId, index === 0 ? [...shared, 'rare'] : shared),
    );
    const plan = planSubscriptions(HOME, devices);
    expect(plan.scheme).toBe('capability');
    expect(plan.requests).toHaveLength(SUBSCRIPTION_LIMIT);
    expect(capabilitiesOf(plan.requests)).toEqual(shared);
    expect(plan.uncoveredCapabilities).toEqual(['rare']);
  });

  it('names devices of other locations, which this installed app cannot subscribe to', () => {
    const plan = planSubscriptions(HOME, [
      device('lamp-1', ['switch']),
      device('far-1', ['contactSensor'], 'loc-2'),
    ]);
    expect(plan.otherLocationDevices).toEqual(['far-1']);
    expect(capabilitiesOf(plan.requests)).toEqual(['switch']);
  });
});

function installed(id: string, request: SubscriptionRequest): InstalledSubscription {
  return (
    INSTALLED_SUBSCRIPTION_LIST.parse({ items: [{ id, installedAppId: 'app-1', ...request }] })
      .items[0] ?? { id, sourceType: 'NONE' }
  );
}

function wantedFor(): readonly SubscriptionRequest[] {
  return planSubscriptions(HOME, [device('lamp-1', ['switch', 'switchLevel'])]).requests;
}

describe('reconciling subscriptions', () => {
  it('creates every subscription when none exist', () => {
    const wanted = wantedFor();
    expect(reconcileSubscriptions([], wanted)).toEqual({ remove: [], create: wanted });
  });

  it('keeps what already exists, removes what is no longer wanted and duplicates', () => {
    const wanted = wantedFor();
    const existing = [
      ...wanted.map((request, index) => installed(`s${String(index)}`, request)),
      installed(
        'dup',
        wanted[0] ?? {
          sourceType: 'DEVICE_HEALTH',
          deviceHealth: { locationId: 'x', subscriptionName: 'x' },
        },
      ),
      installed(
        'old',
        planSubscriptions(HOME, [device('lamp-1', ['contactSensor'])]).requests[2] ?? {
          sourceType: 'DEVICE_HEALTH',
          deviceHealth: { locationId: 'x', subscriptionName: 'x' },
        },
      ),
      { id: 'mode', sourceType: 'MODE' },
    ];
    expect(reconcileSubscriptions(existing, wanted)).toEqual({
      remove: ['dup', 'old', 'mode'],
      create: [],
    });
  });

  it('treats fields SmartThings leaves out as the wildcard and state changes only', () => {
    const wanted = wantedFor();
    const switchRequest = wanted.find(
      (request) =>
        request.sourceType === 'CAPABILITY' && request.capability.capability === 'switch',
    );
    const sparse = INSTALLED_SUBSCRIPTION_LIST.parse({
      items: [
        {
          id: 'a',
          sourceType: 'CAPABILITY',
          capability: { locationId: HOME, capability: 'switch' },
        },
        { id: 'b', sourceType: 'DEVICE_LIFECYCLE', deviceLifecycle: { locationId: HOME } },
        { id: 'c', sourceType: 'DEVICE_HEALTH', deviceHealth: { locationId: HOME } },
      ],
    }).items;
    const changes = reconcileSubscriptions(sparse, wanted);
    expect(changes.remove).toEqual([]);
    expect(changes.create).toHaveLength(1);
    expect(changes.create).not.toContain(switchRequest);
    expect(capabilitiesOf(changes.create)).toEqual(['switchLevel']);
  });

  it('tells subscriptions apart by every field that changes what they deliver', () => {
    const wanted = wantedFor();
    const [lifecycle, health, first] = wanted;
    const changed = [
      { id: 'location', sourceType: 'DEVICE_LIFECYCLE', deviceLifecycle: { locationId: 'loc-2' } },
      { id: 'kind', sourceType: 'DEVICE_HEALTH', deviceLifecycle: { locationId: HOME } },
      {
        id: 'attribute',
        sourceType: 'CAPABILITY',
        capability: { locationId: HOME, capability: 'switch', attribute: 'switch' },
      },
      {
        id: 'value',
        sourceType: 'CAPABILITY',
        capability: { locationId: HOME, capability: 'switch', value: 'on' },
      },
      {
        id: 'changes',
        sourceType: 'CAPABILITY',
        capability: { locationId: HOME, capability: 'switch', stateChangeOnly: false },
      },
    ];
    const changes = reconcileSubscriptions(
      INSTALLED_SUBSCRIPTION_LIST.parse({ items: changed }).items,
      wanted,
    );
    expect(changes.remove).toEqual(['location', 'kind', 'attribute', 'value', 'changes']);
    expect(changes.create).toEqual(wanted);
    expect([lifecycle?.sourceType, health?.sourceType, first?.sourceType]).toEqual([
      'DEVICE_LIFECYCLE',
      'DEVICE_HEALTH',
      'CAPABILITY',
    ]);
  });

  it('matches device subscriptions by device and their wildcards', () => {
    const capabilities = numbered('cap', SUBSCRIPTION_BUDGET + 1);
    const perDevice = planSubscriptions(HOME, [device('lamp-1', capabilities)]).requests;
    const sparse = INSTALLED_SUBSCRIPTION_LIST.parse({
      items: [
        { id: 'same', sourceType: 'DEVICE', device: { deviceId: 'lamp-1' } },
        { id: 'other', sourceType: 'DEVICE', device: { deviceId: 'lamp-2' } },
        {
          id: 'component',
          sourceType: 'DEVICE',
          device: { deviceId: 'lamp-1', componentId: 'main' },
        },
        {
          id: 'capability',
          sourceType: 'DEVICE',
          device: { deviceId: 'lamp-1', capability: 'switch' },
        },
        { id: 'bare-device', sourceType: 'DEVICE' },
        { id: 'bare-lifecycle', sourceType: 'DEVICE_LIFECYCLE' },
        { id: 'bare-capability', sourceType: 'CAPABILITY' },
      ],
    }).items;
    const changes = reconcileSubscriptions(sparse, perDevice);
    expect(changes.remove).toEqual([
      'other',
      'component',
      'capability',
      'bare-device',
      'bare-lifecycle',
      'bare-capability',
    ]);
    expect(devicesOf(changes.create)).toEqual([]);
    expect(changes.create).toHaveLength(2);
  });
});

describe('the installed subscription list', () => {
  it('reads the link to the next page', () => {
    expect(
      INSTALLED_SUBSCRIPTION_LIST.parse({
        items: [],
        _links: { next: { href: 'https://api.smartthings.com/next' } },
      })._links?.next?.href,
    ).toBe('https://api.smartthings.com/next');
    expect(
      INSTALLED_SUBSCRIPTION_LIST.safeParse({ items: [], _links: { next: { href: 'x' } } }).success,
    ).toBe(false);
  });
});

describe('the installed app', () => {
  it('reads its location', () => {
    expect(
      INSTALLED_APP.parse({
        installedAppId: 'app-1',
        locationId: HOME,
        installedAppType: 'API_ONLY',
      }),
    ).toEqual({ installedAppId: 'app-1', locationId: HOME });
  });
});
