import { createHash } from 'node:crypto';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';

export const SUBSCRIPTION_LIMIT = 40;

export const LOCATION_SUBSCRIPTIONS = 2;

export const SUBSCRIPTION_BUDGET = SUBSCRIPTION_LIMIT - LOCATION_SUBSCRIPTIONS;

const ALL = '*';

export interface SubscribedDevice {
  readonly deviceId: string;
  readonly locationId: string;
  readonly capabilities: readonly string[];
}

export type SubscriptionRequest =
  | {
      readonly sourceType: 'CAPABILITY';
      readonly capability: {
        readonly locationId: string;
        readonly capability: string;
        readonly attribute: string;
        readonly value: JsonValue;
        readonly stateChangeOnly: boolean;
        readonly subscriptionName: string;
      };
    }
  | {
      readonly sourceType: 'DEVICE';
      readonly device: {
        readonly deviceId: string;
        readonly componentId: string;
        readonly capability: string;
        readonly attribute: string;
        readonly value: JsonValue;
        readonly stateChangeOnly: boolean;
        readonly subscriptionName: string;
      };
    }
  | {
      readonly sourceType: 'DEVICE_LIFECYCLE';
      readonly deviceLifecycle: { readonly locationId: string; readonly subscriptionName: string };
    }
  | {
      readonly sourceType: 'DEVICE_HEALTH';
      readonly deviceHealth: { readonly locationId: string; readonly subscriptionName: string };
    };

type SubscriptionScheme = 'capability' | 'device';

export interface SubscriptionPlan {
  readonly scheme: SubscriptionScheme;
  readonly requests: readonly SubscriptionRequest[];
  readonly uncoveredCapabilities: readonly string[];
  readonly otherLocationDevices: readonly string[];
}

const OPTIONAL_TEXT = z.string().nullish();

const INSTALLED_SUBSCRIPTION = z.object({
  id: z.string().min(1),
  sourceType: z.string(),
  capability: z
    .object({
      locationId: OPTIONAL_TEXT,
      capability: OPTIONAL_TEXT,
      attribute: OPTIONAL_TEXT,
      value: JSON_VALUE.optional(),
      stateChangeOnly: z.boolean().nullish(),
    })
    .nullish(),
  device: z
    .object({
      deviceId: OPTIONAL_TEXT,
      componentId: OPTIONAL_TEXT,
      capability: OPTIONAL_TEXT,
      attribute: OPTIONAL_TEXT,
      value: JSON_VALUE.optional(),
      stateChangeOnly: z.boolean().nullish(),
    })
    .nullish(),
  deviceLifecycle: z.object({ locationId: OPTIONAL_TEXT }).nullish(),
  deviceHealth: z.object({ locationId: OPTIONAL_TEXT }).nullish(),
});

export type InstalledSubscription = z.infer<typeof INSTALLED_SUBSCRIPTION>;

export const INSTALLED_SUBSCRIPTION_LIST = z.object({
  items: z.array(INSTALLED_SUBSCRIPTION),
  _links: z.object({ next: z.object({ href: z.url() }).nullish() }).nullish(),
});

export const INSTALLED_APP = z.object({
  installedAppId: z.string().min(1),
  locationId: z.string().min(1),
});

interface Identity {
  readonly sourceType: string;
  readonly fields: readonly (JsonValue | undefined)[];
}

function keyOf(identity: Identity): string {
  return JSON.stringify([identity.sourceType, ...identity.fields.map((field) => field ?? ALL)]);
}

function nameOf(identity: Identity): string {
  return `se_${createHash('sha256').update(keyOf(identity)).digest('hex').slice(0, 16)}`;
}

function capabilityRequest(locationId: string, capability: string): SubscriptionRequest {
  const fields = [locationId, capability, ALL, ALL, true];
  return {
    sourceType: 'CAPABILITY',
    capability: {
      locationId,
      capability,
      attribute: ALL,
      value: ALL,
      stateChangeOnly: true,
      subscriptionName: nameOf({ sourceType: 'CAPABILITY', fields }),
    },
  };
}

function deviceRequest(deviceId: string): SubscriptionRequest {
  const fields = [deviceId, ALL, ALL, ALL, ALL, true];
  return {
    sourceType: 'DEVICE',
    device: {
      deviceId,
      componentId: ALL,
      capability: ALL,
      attribute: ALL,
      value: ALL,
      stateChangeOnly: true,
      subscriptionName: nameOf({ sourceType: 'DEVICE', fields }),
    },
  };
}

function locationRequests(locationId: string): readonly SubscriptionRequest[] {
  return [
    {
      sourceType: 'DEVICE_LIFECYCLE',
      deviceLifecycle: {
        locationId,
        subscriptionName: nameOf({ sourceType: 'DEVICE_LIFECYCLE', fields: [locationId] }),
      },
    },
    {
      sourceType: 'DEVICE_HEALTH',
      deviceHealth: {
        locationId,
        subscriptionName: nameOf({ sourceType: 'DEVICE_HEALTH', fields: [locationId] }),
      },
    },
  ];
}

function capabilitiesByReach(devices: readonly SubscribedDevice[]): readonly string[] {
  const reach = new Map<string, number>();
  for (const device of devices) {
    for (const capability of new Set(device.capabilities)) {
      reach.set(capability, (reach.get(capability) ?? 0) + 1);
    }
  }
  return [...reach.entries()]
    .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b))
    .map(([capability]) => capability);
}

export function planSubscriptions(
  locationId: string,
  devices: readonly SubscribedDevice[],
): SubscriptionPlan {
  const here = devices.filter((device) => device.locationId === locationId);
  const otherLocationDevices = devices
    .filter((device) => device.locationId !== locationId)
    .map((device) => device.deviceId);
  const capabilities = capabilitiesByReach(here);
  const base = { otherLocationDevices, uncoveredCapabilities: [] };
  if (capabilities.length > SUBSCRIPTION_BUDGET && here.length <= SUBSCRIPTION_BUDGET) {
    const deviceIds = here.map((device) => device.deviceId).sort();
    return {
      ...base,
      scheme: 'device',
      requests: [...locationRequests(locationId), ...deviceIds.map(deviceRequest)],
    };
  }
  const covered = capabilities.slice(0, SUBSCRIPTION_BUDGET);
  return {
    ...base,
    scheme: 'capability',
    requests: [
      ...locationRequests(locationId),
      ...covered.map((capability) => capabilityRequest(locationId, capability)),
    ],
    uncoveredCapabilities: capabilities.slice(SUBSCRIPTION_BUDGET),
  };
}

function identityOfRequest(request: SubscriptionRequest): Identity {
  switch (request.sourceType) {
    case 'CAPABILITY': {
      const detail = request.capability;
      return {
        sourceType: request.sourceType,
        fields: [
          detail.locationId,
          detail.capability,
          detail.attribute,
          detail.value,
          detail.stateChangeOnly,
        ],
      };
    }
    case 'DEVICE': {
      const detail = request.device;
      return {
        sourceType: request.sourceType,
        fields: [
          detail.deviceId,
          detail.componentId,
          detail.capability,
          detail.attribute,
          detail.value,
          detail.stateChangeOnly,
        ],
      };
    }
    case 'DEVICE_LIFECYCLE':
      return { sourceType: request.sourceType, fields: [request.deviceLifecycle.locationId] };
    case 'DEVICE_HEALTH':
      return { sourceType: request.sourceType, fields: [request.deviceHealth.locationId] };
  }
}

type InstalledCapability = NonNullable<InstalledSubscription['capability']>;

type InstalledDevice = NonNullable<InstalledSubscription['device']>;

function capabilityFields(detail: InstalledCapability): readonly (JsonValue | undefined)[] {
  return [
    detail.locationId,
    detail.capability,
    detail.attribute,
    detail.value,
    detail.stateChangeOnly ?? true,
  ];
}

function deviceFields(detail: InstalledDevice): readonly (JsonValue | undefined)[] {
  return [
    detail.deviceId,
    detail.componentId,
    detail.capability,
    detail.attribute,
    detail.value,
    detail.stateChangeOnly ?? true,
  ];
}

type Fields = readonly (JsonValue | undefined)[];

type FieldReader = (installed: InstalledSubscription) => Fields;

const FIELD_READERS: ReadonlyMap<string, FieldReader> = new Map<string, FieldReader>([
  ['CAPABILITY', (installed): Fields => capabilityFields(installed.capability ?? {})],
  ['DEVICE', (installed): Fields => deviceFields(installed.device ?? {})],
  ['DEVICE_LIFECYCLE', (installed): Fields => [installed.deviceLifecycle?.locationId]],
  ['DEVICE_HEALTH', (installed): Fields => [installed.deviceHealth?.locationId]],
]);

function keyOfInstalled(installed: InstalledSubscription): string | undefined {
  const reader = FIELD_READERS.get(installed.sourceType);
  return reader === undefined
    ? undefined
    : keyOf({ sourceType: installed.sourceType, fields: reader(installed) });
}

export interface SubscriptionChanges {
  readonly remove: readonly string[];
  readonly create: readonly SubscriptionRequest[];
}

export function reconcileSubscriptions(
  installed: readonly InstalledSubscription[],
  wanted: readonly SubscriptionRequest[],
): SubscriptionChanges {
  const wantedKeys = new Set<string | undefined>(
    wanted.map((request) => keyOf(identityOfRequest(request))),
  );
  const kept = new Set<string | undefined>();
  const remove: string[] = [];
  for (const subscription of installed) {
    const key = keyOfInstalled(subscription);
    if (wantedKeys.has(key) && !kept.has(key)) {
      kept.add(key);
    } else {
      remove.push(subscription.id);
    }
  }
  return {
    remove,
    create: wanted.filter((request) => !kept.has(keyOf(identityOfRequest(request)))),
  };
}
