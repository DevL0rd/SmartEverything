import {
  isCamera,
  isClimateDevice,
  isScale,
  isWearable,
  type FirewallStatus,
  type HubStatus,
  type McpConsentRequest,
  type Provider,
  type SettingsRow,
  type SmartThingsWebhook,
  type TableRow,
  replacedIds,
} from '@smarteverything/domain';
import { shallowEqual, useStoreSelector } from './store-context';
import {
  rowsOf,
  type Device,
  type DeviceValue,
  type DeviceValues,
  type ListTable,
  type RowOf,
  type Session,
  type StoreState,
  type SyncState,
  type Table,
} from './state';

class HomeNotLoadedError extends Error {
  override readonly name = 'HomeNotLoadedError';

  constructor(readonly what: string) {
    super(
      `${what} is read before your home finished loading; render this only inside the loaded shell.`,
    );
  }
}

function useTable<T extends ListTable>(table: T): Table<RowOf<T>> {
  return useStoreSelector((state) => state.tables[table]);
}

export function useRows<T extends ListTable>(table: T): readonly RowOf<T>[] {
  return rowsOf(useTable(table));
}

export function useRow<T extends ListTable>(table: T, id: string | null): RowOf<T> | null {
  return useStoreSelector((state) => (id === null ? null : (state.tables[table].byId[id] ?? null)));
}

export function useLoaded(): boolean {
  return useStoreSelector((state) => state.loaded);
}

export function useSyncStatus(): SyncState {
  return useStoreSelector((state) => state.sync);
}

export function useHubStatus(): HubStatus | null {
  return useStoreSelector((state) => state.hub);
}

export function useSettings(): SettingsRow {
  const settings = useStoreSelector((state) => state.settings);
  if (settings === null) {
    throw new HomeNotLoadedError('The home settings');
  }
  return settings;
}

export function useSession(): Session {
  const session = useStoreSelector((state) => state.session);
  if (session === null) {
    throw new HomeNotLoadedError('This device’s session');
  }
  return session;
}

export function useIsOwner(): boolean {
  return useStoreSelector((state) => state.session?.client.role === 'owner');
}

export interface DeviceFilter {
  readonly room?: string | null;
  readonly includeHidden?: boolean;
}

function devicesMatching(state: StoreState, filter: DeviceFilter): readonly Device[] {
  return rowsOf(state.tables.devices).filter(
    (device) =>
      (filter.includeHidden === true || !device.hidden) &&
      (filter.room === undefined || device.room_id === filter.room),
  );
}

export function useDevices(filter: DeviceFilter = {}): readonly Device[] {
  return useStoreSelector((state) => devicesMatching(state, filter), shallowEqual);
}

function listedIn(state: StoreState): readonly Device[] {
  const devices = rowsOf(state.tables.devices);
  const replaced = replacedIds(devices);
  return devices.filter((device) => !replaced.has(device.id));
}

export function useListedDevices(): readonly Device[] {
  return useStoreSelector(listedIn, shallowEqual);
}

export function useDevice(deviceId: string): Device | null {
  return useRow('devices', deviceId);
}

const NO_VALUES: DeviceValues = {};

export function useDeviceValues(deviceId: string): DeviceValues {
  return useStoreSelector((state) => state.deviceValues[deviceId] ?? NO_VALUES);
}

export function useDeviceValue(deviceId: string, capability: string): DeviceValue | null {
  return useStoreSelector((state) => state.deviceValues[deviceId]?.[capability] ?? null);
}

export function useRooms(): readonly TableRow<'rooms'>[] {
  return useRows('rooms');
}

export function useRoom(roomId: string | null): TableRow<'rooms'> | null {
  return useRow('rooms', roomId);
}

export function useRoomName(deviceId: string): string | null {
  return useStoreSelector((state) => {
    const room = state.tables.devices.byId[deviceId]?.room_id;
    return room === null || room === undefined
      ? null
      : (state.tables.rooms.byId[room]?.name ?? null);
  });
}

export function useProviderLink(provider: Provider): TableRow<'provider_links'> | null {
  return useRow('provider_links', provider);
}

export function useIrRemotes(deviceId: string | null = null): readonly TableRow<'ir_remotes'>[] {
  const remotes = useRows('ir_remotes');
  return deviceId === null ? remotes : remotes.filter((remote) => remote.blaster_id === deviceId);
}

export function useIrCodes(remoteId: string): readonly TableRow<'ir_codes'>[] {
  return useRows('ir_codes').filter((code) => code.remote_id === remoteId);
}

export function useFirewall(): FirewallStatus | null {
  return useStoreSelector((state) => state.firewall);
}

export function useConsentRequests(): readonly McpConsentRequest[] {
  return useStoreSelector((state) => state.consentRequests);
}

export function useServiceLog(): readonly string[] {
  return useStoreSelector((state) => state.serviceLog);
}

export function useSmartThingsWebhook(): SmartThingsWebhook | null {
  return useStoreSelector((state) => state.smartthingsWebhook);
}

export interface Availability {
  readonly hasDevices: boolean;
  readonly hasClimate: boolean;
  readonly hasCameras: boolean;
  readonly hasHealth: boolean;
  readonly hasScenes: boolean;
  readonly hasEnergy: boolean;
  readonly hasSecurity: boolean;
  readonly hasIr: boolean;
  readonly hasWatch: boolean;
  readonly needsAttention: boolean;
}

const SECURITY_KINDS: ReadonlySet<string> = new Set(['lock']);

function availabilityOf(state: StoreState): Availability {
  const devices = rowsOf(state.tables.devices).filter((device) => !device.hidden);
  return {
    hasDevices: devices.length > 0,
    hasClimate: devices.some(isClimateDevice),
    hasCameras: devices.some(isCamera),
    hasHealth:
      state.tables.health_daily.ids.length > 0 ||
      rowsOf(state.tables.health_sources).some((source) => source.revoked_at === null) ||
      devices.some((device) => isWearable(device) || isScale(device)),
    hasScenes: state.tables.scenes.ids.length > 0,
    hasEnergy: devices.some((device) =>
      device.capabilities.some((capability) => capability.key === 'power_draw'),
    ),
    hasSecurity: devices.some((device) => SECURITY_KINDS.has(device.kind)),
    hasIr: state.tables.ir_remotes.ids.length > 0,
    hasWatch: devices.some(
      (device) => device.provider === 'local' && device.details['driver'] === 'xiaomi_watch',
    ),
    needsAttention: rowsOf(state.tables.provider_links).some(
      (link) => link.status === 'needs_attention',
    ),
  };
}

const AVAILABILITY_KEYS: readonly (keyof Availability)[] = [
  'hasDevices',
  'hasClimate',
  'hasCameras',
  'hasHealth',
  'hasScenes',
  'hasEnergy',
  'hasSecurity',
  'hasIr',
  'hasWatch',
  'needsAttention',
];

function sameAvailability(left: Availability, right: Availability): boolean {
  return AVAILABILITY_KEYS.every((key) => left[key] === right[key]);
}

export function useAvailability(): Availability {
  return useStoreSelector(availabilityOf, sameAvailability);
}
