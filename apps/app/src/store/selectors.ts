import { useMemo } from 'react';
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
import { memoOnInputs } from './memo-selector';
import { shallowEqual, useStoreSelector } from './store-context';
import {
  rowsOf,
  type Device,
  type DeviceValue,
  deviceValuesOf,
  type DeviceValues,
  type ListTable,
  type RowOf,
  type Session,
  type StoreState,
  type SyncState,
} from './state';

class HomeNotLoadedError extends Error {
  override readonly name = 'HomeNotLoadedError';

  constructor(readonly what: string) {
    super(
      `${what} is read before your home finished loading; render this only inside the loaded shell.`,
    );
  }
}

export function useRows<T extends ListTable>(table: T): readonly RowOf<T>[] {
  return useStoreSelector((state) => rowsOf(state.tables[table]), Object.is, [table]);
}

export function useRow<T extends ListTable>(table: T, id: string | null): RowOf<T> | null {
  return useStoreSelector(
    (state) => (id === null ? null : (state.tables[table].byId[id] ?? null)),
    Object.is,
    [table, id],
  );
}

const selectLoaded = (state: StoreState): boolean => state.loaded;

export function useLoaded(): boolean {
  return useStoreSelector(selectLoaded);
}

export type SyncStatus = Omit<SyncState, 'seq'>;

const selectSync = (state: StoreState): SyncStatus => state.sync;

function sameSyncStatus(left: SyncStatus, right: SyncStatus): boolean {
  return (
    left.status === right.status &&
    left.problem === right.problem &&
    shallowEqual(left.outdated, right.outdated)
  );
}

export function useSyncStatus(): SyncStatus {
  return useStoreSelector(selectSync, sameSyncStatus);
}

const selectHub = (state: StoreState): HubStatus | null => state.hub;

export function useHubStatus(): HubStatus | null {
  return useStoreSelector(selectHub);
}

const selectSettings = (state: StoreState): SettingsRow | null => state.settings;

export function useSettings(): SettingsRow {
  const settings = useStoreSelector(selectSettings);
  if (settings === null) {
    throw new HomeNotLoadedError('The home settings');
  }
  return settings;
}

const selectSession = (state: StoreState): Session | null => state.session;

export function useSession(): Session {
  const session = useStoreSelector(selectSession);
  if (session === null) {
    throw new HomeNotLoadedError('This device’s session');
  }
  return session;
}

const selectIsOwner = (state: StoreState): boolean => state.session?.client.role === 'owner';

export function useIsOwner(): boolean {
  return useStoreSelector(selectIsOwner);
}

export interface DeviceFilter {
  readonly room?: string | null;
  readonly includeHidden?: boolean;
}

const devicesTable = (state: StoreState): readonly unknown[] => [state.tables.devices];

const DEVICE_SELECTORS = new Map<string, (state: StoreState) => readonly Device[]>();

function deviceSelector(filter: DeviceFilter): (state: StoreState) => readonly Device[] {
  const room = filter.room === undefined ? '*' : filter.room === null ? 'none' : `=${filter.room}`;
  const key = `${room}|${filter.includeHidden === true ? 'hidden' : 'visible'}`;
  const known = DEVICE_SELECTORS.get(key);
  if (known !== undefined) {
    return known;
  }
  const selector = memoOnInputs(devicesTable, (state) =>
    rowsOf(state.tables.devices).filter(
      (device) =>
        (filter.includeHidden === true || !device.hidden) &&
        (filter.room === undefined || device.room_id === filter.room),
    ),
  );
  DEVICE_SELECTORS.set(key, selector);
  return selector;
}

export function useDevices(filter: DeviceFilter = {}): readonly Device[] {
  return useStoreSelector(deviceSelector(filter), shallowEqual);
}

const listedIn = memoOnInputs(devicesTable, (state): readonly Device[] => {
  const devices = rowsOf(state.tables.devices);
  const replaced = replacedIds(devices);
  return devices.filter((device) => !replaced.has(device.id));
});

export function useListedDevices(): readonly Device[] {
  return useStoreSelector(listedIn, shallowEqual);
}

export function useDevice(deviceId: string): Device | null {
  return useRow('devices', deviceId);
}

export function useDeviceValues(deviceId: string): DeviceValues {
  return useStoreSelector((state) => deviceValuesOf(state, deviceId), Object.is, [deviceId]);
}

export function useDeviceValue(deviceId: string, capability: string): DeviceValue | null {
  return useStoreSelector(
    (state) => state.deviceValues[deviceId]?.[capability] ?? null,
    Object.is,
    [deviceId, capability],
  );
}

export function useRooms(): readonly TableRow<'rooms'>[] {
  return useRows('rooms');
}

export function useRoom(roomId: string | null): TableRow<'rooms'> | null {
  return useRow('rooms', roomId);
}

export function useRoomName(deviceId: string): string | null {
  return useStoreSelector(
    (state) => {
      const room = state.tables.devices.byId[deviceId]?.room_id;
      return room === null || room === undefined
        ? null
        : (state.tables.rooms.byId[room]?.name ?? null);
    },
    Object.is,
    [deviceId],
  );
}

export function useProviderLink(provider: Provider): TableRow<'provider_links'> | null {
  return useRow('provider_links', provider);
}

export function useIrRemotes(deviceId: string | null = null): readonly TableRow<'ir_remotes'>[] {
  const remotes = useRows('ir_remotes');
  return useMemo(
    () =>
      deviceId === null ? remotes : remotes.filter((remote) => remote.blaster_id === deviceId),
    [remotes, deviceId],
  );
}

export function useIrCodes(remoteId: string): readonly TableRow<'ir_codes'>[] {
  const codes = useRows('ir_codes');
  return useMemo(() => codes.filter((code) => code.remote_id === remoteId), [codes, remoteId]);
}

const selectFirewall = (state: StoreState): FirewallStatus | null => state.firewall;

export function useFirewall(): FirewallStatus | null {
  return useStoreSelector(selectFirewall);
}

const selectConsentRequests = (state: StoreState): readonly McpConsentRequest[] =>
  state.consentRequests;

export function useConsentRequests(): readonly McpConsentRequest[] {
  return useStoreSelector(selectConsentRequests);
}

const selectServiceLog = (state: StoreState): readonly string[] => state.serviceLog;

export function useServiceLog(): readonly string[] {
  return useStoreSelector(selectServiceLog);
}

const selectSmartThingsWebhook = (state: StoreState): SmartThingsWebhook | null =>
  state.smartthingsWebhook;

export function useSmartThingsWebhook(): SmartThingsWebhook | null {
  return useStoreSelector(selectSmartThingsWebhook);
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

const availabilityInputs = (state: StoreState): readonly unknown[] => [
  state.tables.devices,
  state.tables.health_daily,
  state.tables.health_sources,
  state.tables.scenes,
  state.tables.ir_remotes,
  state.tables.provider_links,
];

const availabilityOf = memoOnInputs(availabilityInputs, (state): Availability => {
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
});

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
