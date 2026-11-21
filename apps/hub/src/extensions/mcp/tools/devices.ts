import {
  DEVICE_FAMILIES,
  DEVICE_KINDS,
  presentDevice,
  presentValue,
  type DeviceScope,
  type JsonValue,
  type PresentedCapability,
  type StateRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { CURSOR, moreOf, paged, type Paged } from '../../../ai-tools/paging';
import type { PhoneViewer } from '../../../phones/phone-detail';
import type { Store } from '../../../store/store';
import type { DeviceFacts } from './device-detail-units';
import {
  NO_PREPARED_PARTS,
  definePart,
  partsOf,
  preparedPartsOf,
  type DevicePart,
  type PartContext,
  type PreparedParts,
} from './device-parts';
import { DEVICE_REFERENCE } from './references';
import { deviceScopeOfActor, phoneViewerOfActor, type Limited } from './person-reach';
import { READS, ToolError, defineTool, matches, type Tool } from './registry';
import { formatOf } from './value-format';
import { VACUUM_PART } from './vacuum-part';
import { inRooms, placedDevice, placedDevices, findCapability, type Placed } from './targets';

export const DEVICE_FILTER = z.strictObject({
  rooms: z.array(z.string().min(1)).min(1).optional().describe('Room ids or names'),
  families: z
    .array(z.enum(DEVICE_FAMILIES))
    .min(1)
    .optional()
    .describe(
      'Exact device families; a tower fan is tower_fan and other fans are fan, a lamp is light',
    ),
  kinds: z
    .array(z.enum(DEVICE_KINDS))
    .min(1)
    .optional()
    .describe(
      'Provider device kinds, coarser than families: kind fan covers both fan and tower_fan',
    ),
  capability: z
    .string()
    .min(1)
    .optional()
    .describe('Only devices with this capability key, role or label'),
  search: z.string().min(1).max(100).optional().describe('Words in the name, model or room'),
  includeHidden: z.boolean().default(false).describe('Also list devices hidden in the app'),
  limit: z.number().int().min(1).max(500).default(200),
  cursor: CURSOR,
  detail: z.boolean().default(false).describe('Each device in full, as device_read gives it'),
});

const DETAIL_MAX = 5;

const NOTHING_MATCHES =
  'No device matches every filter given. families and kinds are exact names (a tower fan is the family tower_fan, a lamp is light), search needs all of its words in a device’s name, model, kind, family or room, rooms are room names. Retry with one filter, or call with no filter; if nothing fits, say so and ask the person which device they mean. Never send commands to a device you did not find for this purpose.';

export type DeviceFind = z.infer<typeof DEVICE_FILTER>;

type DeviceFilter = Omit<DeviceFind, 'detail' | 'cursor'> & {
  readonly cursor?: string | undefined;
};

function deviceSummary({ name, device, room, family }: Placed): Record<string, unknown> {
  return {
    id: device.id,
    name,
    family,
    kind: device.kind,
    provider: device.provider,
    model: device.model,
    manufacturer: device.manufacturer,
    online: device.online,
    room_id: device.room_id,
    room: room === null ? null : room.name,
    favourite: device.favourite,
    hidden: device.hidden,
    capabilities: device.capabilities.map((capability) => capability.key),
  };
}

function placedAsAsked(filter: DeviceFilter, { device, room, family }: Placed): boolean {
  return (
    (filter.rooms === undefined || inRooms(room, filter.rooms)) &&
    (filter.families === undefined || filter.families.includes(family)) &&
    (filter.kinds === undefined || filter.kinds.includes(device.kind))
  );
}

function wanted(filter: DeviceFilter, placed: Placed): boolean {
  return (
    placedAsAsked(filter, placed) &&
    (filter.capability === undefined ||
      findCapability(placed.device, filter.capability) !== undefined) &&
    (filter.search === undefined || deviceMatches(filter.search, placed)) &&
    (filter.includeHidden || !placed.device.hidden)
  );
}

function deviceMatches(search: string, { name, device, room, family }: Placed): boolean {
  return matches(
    search,
    name,
    device.name,
    device.display_name,
    device.model,
    device.manufacturer,
    device.kind,
    family,
    room?.name ?? null,
  );
}

async function listedPlaced(
  store: Store,
  scope: DeviceScope | null,
  filter: DeviceFilter,
): Promise<Paged<Placed>> {
  return paged(
    (await placedDevices(store, scope)).filter((placed) => wanted(filter, placed)),
    filter.cursor,
    filter.limit,
  );
}

export async function listedDevices(
  store: Store,
  scope: DeviceScope | null,
  filter: DeviceFilter,
): Promise<Record<string, unknown>[]> {
  return (await listedPlaced(store, scope, filter)).rows.map(deviceSummary);
}

type FoundFilter = DeviceFilter & Pick<DeviceFind, 'detail'>;

async function foundPage(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  filter: FoundFilter,
): Promise<Paged<Record<string, unknown>>> {
  const { rows, more } = await listedPlaced(store, scope, filter);
  if (!filter.detail || rows.length > DETAIL_MAX) {
    return { rows: rows.map(deviceSummary), more };
  }
  return { rows: await detailsOf(store, scope, viewer, rows), more };
}

export async function foundDevices(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  filter: FoundFilter,
): Promise<Record<string, unknown>[]> {
  return (await foundPage(store, scope, viewer, filter)).rows;
}

function described(
  presented: PresentedCapability,
  state: StateRow | undefined,
): Record<string, unknown> {
  const value: JsonValue | undefined = state?.value;
  return {
    key: presented.key,
    label: presented.label,
    role: presented.role,
    group: presented.groupLabel,
    tier: presented.tier,
    danger: presented.danger.tier,
    destructive: presented.danger.tier !== 'none',
    access: presented.capability.access,
    writable: presented.writable,
    value_type: presented.capability.value,
    value_format: formatOf(presented.capability.value),
    options: presented.options,
    unit: presented.unit,
    value: value ?? null,
    shown_as: value === undefined ? null : presentValue(presented, value),
    observed_at: state?.observed_at ?? null,
  };
}

function factOf(fact: Record<string, unknown> | null, part: string): Record<string, unknown> {
  if (fact === null) {
    throw new ToolError(`The ${part} details were not read for this device`, 'internal');
  }
  return fact;
}

const DEVICE_PARTS: readonly DevicePart[] = [
  definePart({
    part: 'television',
    kinds: ['television'],
    unloaded: null,
    read: (source) => factOf(source.facts.television, 'television'),
  }),
  definePart({
    part: 'infrared',
    kinds: ['ir_blaster', 'ir_remote'],
    unloaded: null,
    read: (source) => factOf(source.facts.infrared, 'infrared'),
  }),
  VACUUM_PART,
];

interface DetailRequest {
  readonly scope: DeviceScope | null;
  readonly placed: Placed;
  readonly facts: DeviceFacts;
  readonly prepared: PreparedParts;
}

async function factsOf(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  placed: readonly Placed[],
): Promise<Readonly<Record<string, DeviceFacts>>> {
  return await store.host.read('mcpDeviceFacts', {
    deviceIds: placed.map(({ device }) => device.id),
    scope,
    viewer,
  });
}

function factsFor(facts: Readonly<Record<string, DeviceFacts>>, placed: Placed): DeviceFacts {
  const found = facts[placed.device.id];
  if (found === undefined) {
    throw new ToolError(`The details of ${placed.name} were not read`, 'internal');
  }
  return found;
}

async function detailsOf(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  placed: readonly Placed[],
): Promise<Record<string, unknown>[]> {
  const facts = await factsOf(store, scope, viewer, placed);
  return placed.map((one) =>
    preparedDetails({
      scope,
      placed: one,
      facts: factsFor(facts, one),
      prepared: NO_PREPARED_PARTS,
    }),
  );
}

export async function deviceDetails(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  placed: Placed,
): Promise<Record<string, unknown>> {
  const [details] = await detailsOf(store, scope, viewer, [placed]);
  if (details === undefined) {
    throw new ToolError(`The details of ${placed.name} were not read`, 'internal');
  }
  return details;
}

function preparedDetails({
  scope,
  placed,
  facts,
  prepared,
}: DetailRequest): Record<string, unknown> {
  const states = new Map(facts.states.map((row) => [row.capability, row]));
  const presented = presentDevice(placed.device).capabilities;
  return {
    device: {
      ...deviceSummary(placed),
      details: placed.device.details,
      updated_at: placed.device.updated_at,
      camera: facts.camera,
      model: facts.model,
      ...partsOf(DEVICE_PARTS, { facts, scope, placed, states, presented }, prepared),
    },
    capabilities: presented.map((capability) => described(capability, states.get(capability.key))),
  };
}

function hasCriteria(filter: DeviceFind): boolean {
  return [filter.rooms, filter.families, filter.kinds, filter.capability, filter.search].some(
    (criterion) => criterion !== undefined,
  );
}

async function familiesPresent(
  store: Store,
  scope: DeviceScope | null,
  filter: DeviceFind,
): Promise<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const placed of await placedDevices(store, scope)) {
    if (filter.includeHidden || !placed.device.hidden) {
      counts.set(placed.family, (counts.get(placed.family) ?? 0) + 1);
    }
  }
  return Object.fromEntries(counts);
}

async function foundOrNothing(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  filter: DeviceFind,
): Promise<Record<string, unknown>> {
  const { rows: devices, more } = await foundPage(store, scope, viewer, filter);
  if (devices.length > 0 || filter.cursor !== undefined || !hasCriteria(filter)) {
    return { devices, ...moreOf(more) };
  }
  return {
    devices,
    nothing_matches: NOTHING_MATCHES,
    families_in_the_home: await familiesPresent(store, scope, filter),
  };
}

export function listDevices(context: Limited, input: DeviceFind): Promise<Record<string, unknown>> {
  return foundOrNothing(
    context.store,
    deviceScopeOfActor(context),
    phoneViewerOfActor(context),
    input,
  );
}

export async function readDevice(
  context: PartContext & Limited,
  reference: string,
): Promise<Record<string, unknown>> {
  const scope = deviceScopeOfActor(context);
  const placed = await placedDevice(context.store, scope, reference);
  const [facts, prepared] = await Promise.all([
    factsOf(context.store, scope, phoneViewerOfActor(context), [placed]),
    preparedPartsOf(DEVICE_PARTS, context, placed),
  ]);
  return preparedDetails({ scope, placed, facts: factsFor(facts, placed), prepared });
}

export const DEVICE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_devices',
    input: DEVICE_FILTER,
    annotations: READS,
    run: async (context, input) => ({ structured: await listDevices(context, input) }),
  }),
  defineTool({
    name: 'device_read',
    input: z.strictObject({ deviceId: DEVICE_REFERENCE }),
    annotations: READS,
    run: async (context, input) => ({ structured: await readDevice(context, input.deviceId) }),
  }),
];
