import {
  DEVICE_FAMILIES,
  DEVICE_KINDS,
  EMPTY_IR_REMOTE_STATE,
  presentDevice,
  presentValue,
  type DeviceScope,
  type IrRemoteState,
  type JsonValue,
  type PresentedCapability,
  type StateRow,
  type TelevisionSettingsRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { CURSOR, moreOf, paged, type Paged } from '../../../ai-tools/paging';
import type { PhoneViewer } from '../../../phones/phone-detail';
import { visibleRows } from '../../../phones/phone-visibility';
import type { Store } from '../../../store/store';
import { DEVICE_REFERENCE } from './references';
import { deviceScopeOfActor, phoneViewerOfActor, type Limited } from './person-reach';
import { READS, defineTool, matches, type Tool } from './registry';
import { formatOf } from './value-format';
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

function listedPlaced(
  store: Store,
  scope: DeviceScope | null,
  filter: DeviceFilter,
): Paged<Placed> {
  return paged(
    placedDevices(store, scope).filter((placed) => wanted(filter, placed)),
    filter.cursor,
    filter.limit,
  );
}

export function listedDevices(
  store: Store,
  scope: DeviceScope | null,
  filter: DeviceFilter,
): Record<string, unknown>[] {
  return listedPlaced(store, scope, filter).rows.map(deviceSummary);
}

type FoundFilter = DeviceFilter & Pick<DeviceFind, 'detail'>;

function foundPage(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  filter: FoundFilter,
): Paged<Record<string, unknown>> {
  const { rows, more } = listedPlaced(store, scope, filter);
  if (!filter.detail || rows.length > DETAIL_MAX) {
    return { rows: rows.map(deviceSummary), more };
  }
  return { rows: rows.map((placed) => deviceDetails(store, scope, viewer, placed)), more };
}

export function foundDevices(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  filter: FoundFilter,
): Record<string, unknown>[] {
  return foundPage(store, scope, viewer, filter).rows;
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

function directLinkOf(
  settings: TelevisionSettingsRow | undefined,
): { readonly address: string; readonly mac: string } | null {
  const host = settings?.direct_host ?? null;
  const mac = settings?.direct_mac ?? null;
  return host === null || mac === null ? null : { address: host, mac };
}

function televisionOf(store: Store, { device }: Placed): Record<string, unknown> {
  const settings = store.televisionSettings.find(device.id);
  return {
    direct_link: directLinkOf(settings),
    wake_address: settings?.wake_macs[0] ?? null,
    last_wake_worked_at: settings?.wake_worked_at ?? null,
    input_names: settings?.input_names ?? {},
  };
}

function assumedState(store: Store, remoteId: string): IrRemoteState {
  return store.settings.read().ir_remotes[remoteId] ?? EMPTY_IR_REMOTE_STATE;
}

function infraredOf(
  store: Store,
  scope: DeviceScope | null,
  { device }: Placed,
): Record<string, unknown> {
  if (device.kind === 'ir_remote') {
    return { assumed: assumedState(store, device.id) };
  }
  const deviceRemotes = placedDevices(store, scope)
    .filter((placed) => placed.device.kind === 'ir_remote' && placed.device.parent_id === device.id)
    .map((placed) => ({ id: placed.device.id, name: placed.name }));
  const learned = store.infrared
    .remotes()
    .filter((remote) => remote.blaster_id === device.id)
    .map((remote) => ({ id: remote.id, name: remote.name }));
  return {
    remotes: [...deviceRemotes, ...learned].map((remote) => ({
      ...remote,
      assumed: assumedState(store, remote.id),
    })),
  };
}

const IR_KINDS: ReadonlySet<string> = new Set(['ir_blaster', 'ir_remote']);

export function deviceDetails(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  placed: Placed,
): Record<string, unknown> {
  const states = new Map(
    visibleRows(store, viewer, store.state.ofDevice(placed.device.id)).map((row) => [
      row.capability,
      row,
    ]),
  );
  const camera = store.cameras.find(placed.device.id);
  return {
    device: {
      ...deviceSummary(placed),
      details: placed.device.details,
      updated_at: placed.device.updated_at,
      camera: camera ?? null,
      ...(placed.device.kind === 'television' ? { television: televisionOf(store, placed) } : {}),
      ...(IR_KINDS.has(placed.device.kind) ? { infrared: infraredOf(store, scope, placed) } : {}),
    },
    capabilities: presentDevice(placed.device).capabilities.map((presented) =>
      described(presented, states.get(presented.key)),
    ),
  };
}

function hasCriteria(filter: DeviceFind): boolean {
  return [filter.rooms, filter.families, filter.kinds, filter.capability, filter.search].some(
    (criterion) => criterion !== undefined,
  );
}

function familiesPresent(
  store: Store,
  scope: DeviceScope | null,
  filter: DeviceFind,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const placed of placedDevices(store, scope)) {
    if (filter.includeHidden || !placed.device.hidden) {
      counts.set(placed.family, (counts.get(placed.family) ?? 0) + 1);
    }
  }
  return Object.fromEntries(counts);
}

function foundOrNothing(
  store: Store,
  scope: DeviceScope | null,
  viewer: PhoneViewer,
  filter: DeviceFind,
): Record<string, unknown> {
  const { rows: devices, more } = foundPage(store, scope, viewer, filter);
  if (devices.length > 0 || filter.cursor !== undefined || !hasCriteria(filter)) {
    return { devices, ...moreOf(more) };
  }
  return {
    devices,
    nothing_matches: NOTHING_MATCHES,
    families_in_the_home: familiesPresent(store, scope, filter),
  };
}

export function listDevices(context: Limited, input: DeviceFind): Record<string, unknown> {
  return foundOrNothing(
    context.store,
    deviceScopeOfActor(context),
    phoneViewerOfActor(context),
    input,
  );
}

export const DEVICE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_devices',
    input: DEVICE_FILTER,
    annotations: READS,
    run: (context, input) => ({ structured: listDevices(context, input) }),
  }),
  defineTool({
    name: 'device_read',
    input: z.strictObject({ deviceId: DEVICE_REFERENCE }),
    annotations: READS,
    run: (context, input) => {
      const scope = deviceScopeOfActor(context);
      return {
        structured: deviceDetails(
          context.store,
          scope,
          phoneViewerOfActor(context),
          placedDevice(context.store, scope, input.deviceId),
        ),
      };
    },
  }),
];
