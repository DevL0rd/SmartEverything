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
import { sameJson } from './same-json';
import { shallowEqual, useStoreSelector } from './store-context';
import {
  rowsOf,
  type Device,
  type DeviceValue,
  deviceValuesOf,
  type DeviceValues,
  type ListTable,
  type RowOf,
  type SectionFailure,
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

export type SyncStatus = Omit<SyncState, 'seq' | 'offlineSince'>;

const selectSync = (state: StoreState): SyncStatus => state.sync;

function sameSyncStatus(left: SyncStatus, right: SyncStatus): boolean {
  return (
    left.status === right.status &&
    left.problem === right.problem &&
    shallowEqual(left.failed, right.failed)
  );
}

export function useSyncStatus(): SyncStatus {
  return useStoreSelector(selectSync, sameSyncStatus);
}

export function sectionFailureOf(sync: SyncStatus, section: string): SectionFailure | null {
  return sync.failed.find((failure) => failure.section === section) ?? null;
}

export function useSectionFailure(section: string): SectionFailure | null {
  return sectionFailureOf(useSyncStatus(), section);
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

export const selectIsOwner = (state: StoreState): boolean => state.session?.client.role === 'owner';

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

export function devicesIn(state: StoreState, filter: DeviceFilter): readonly Device[] {
  return deviceSelector(filter)(state);
}

export function useDevices(filter: DeviceFilter = {}): readonly Device[] {
  return useStoreSelector(deviceSelector(filter), shallowEqual);
}

const visibleDevices = deviceSelector({});

function deviceCountIn(state: StoreState): number {
  return visibleDevices(state).length;
}

export function useDeviceCount(): number {
  return useStoreSelector(deviceCountIn);
}

function computersSelector(): (state: StoreState) => readonly Device[] {
  let held: readonly Device[] = [];
  return memoOnInputs(devicesTable, (state) => {
    const computers = visibleDevices(state).filter((device) => device.kind === 'computer');
    if (shallowEqual(held, computers)) return held;
    held = computers;
    return held;
  });
}

export const computersIn = computersSelector();

export function useComputers(): readonly Device[] {
  return useStoreSelector(computersIn);
}

export type DeviceNameField = 'name' | 'label';

function deviceNamesSelector(
  field: DeviceNameField,
): (state: StoreState) => ReadonlyMap<string, string> {
  let held: ReadonlyMap<string, string> = new Map();
  return memoOnInputs(devicesTable, (state) => {
    const devices = rowsOf(state.tables.devices);
    if (
      held.size === devices.length &&
      devices.every((device) => held.get(device.id) === device[field])
    ) {
      return held;
    }
    held = new Map(devices.map((device) => [device.id, device[field]]));
    return held;
  });
}

const DEVICE_NAMES: Readonly<
  Record<DeviceNameField, (state: StoreState) => ReadonlyMap<string, string>>
> = {
  name: deviceNamesSelector('name'),
  label: deviceNamesSelector('label'),
};

export function deviceNamesIn(
  state: StoreState,
  field: DeviceNameField,
): ReadonlyMap<string, string> {
  return DEVICE_NAMES[field](state);
}

export function useDeviceNames(field: DeviceNameField): ReadonlyMap<string, string> {
  return useStoreSelector(DEVICE_NAMES[field], Object.is, [field]);
}

const automationsTable = (state: StoreState): readonly unknown[] => [state.tables.automations];

function automationNamesSelector(): (state: StoreState) => ReadonlyMap<string, string> {
  let held: ReadonlyMap<string, string> = new Map();
  return memoOnInputs(automationsTable, (state) => {
    const automations = rowsOf(state.tables.automations);
    if (
      held.size === automations.length &&
      automations.every((automation) => held.get(automation.id) === automation.name)
    ) {
      return held;
    }
    held = new Map(automations.map((automation) => [automation.id, automation.name]));
    return held;
  });
}

const automationNamesIn = automationNamesSelector();

export function useAutomationNames(): ReadonlyMap<string, string> {
  return useStoreSelector(automationNamesIn);
}

export type DevicePredicate = (device: Device) => boolean;

export function useDeviceIds(predicate: DevicePredicate, filter: DeviceFilter = {}): string {
  return useStoreSelector(
    (state) =>
      devicesIn(state, filter)
        .filter(predicate)
        .map((device) => device.id)
        .join(','),
    Object.is,
    [predicate, filter.room, filter.includeHidden],
  );
}

export function useMatchingDevices(
  predicate: DevicePredicate,
  filter: DeviceFilter = {},
): readonly Device[] {
  return useStoreSelector((state) => devicesIn(state, filter).filter(predicate), shallowEqual, [
    predicate,
    filter.room,
    filter.includeHidden,
  ]);
}

export function useFirstDevice(
  predicate: DevicePredicate,
  filter: DeviceFilter = {},
): Device | null {
  return useStoreSelector((state) => devicesIn(state, filter).find(predicate) ?? null, Object.is, [
    predicate,
    filter.room,
    filter.includeHidden,
  ]);
}

export function useHasDevice(predicate: DevicePredicate, filter: DeviceFilter = {}): boolean {
  return useStoreSelector((state) => devicesIn(state, filter).some(predicate), Object.is, [
    predicate,
    filter.room,
    filter.includeHidden,
  ]);
}

export const listedDevicesIn = memoOnInputs(devicesTable, (state): readonly Device[] => {
  const devices = rowsOf(state.tables.devices);
  const replaced = replacedIds(devices);
  return devices.filter((device) => !replaced.has(device.id));
});

export function useListedDevices(): readonly Device[] {
  return useStoreSelector(listedDevicesIn, shallowEqual);
}

export function useDevice(deviceId: string): Device | null {
  return useRow('devices', deviceId);
}

export function useDeviceLabel(deviceId: string): string | null {
  return useStoreSelector(
    (state) => {
      const device = state.tables.devices.byId[deviceId];
      return device === undefined ? null : device.label;
    },
    Object.is,
    [deviceId],
  );
}

export function useDeviceValues(deviceId: string): DeviceValues {
  return useStoreSelector((state) => deviceValuesOf(state, deviceId), Object.is, [deviceId]);
}

export function useDeviceDerived<T>(
  deviceId: string,
  derive: (values: DeviceValues) => T,
  deps: readonly unknown[],
  equal: (left: T, right: T) => boolean = sameJson,
): T {
  return useStoreSelector((state) => derive(deviceValuesOf(state, deviceId)), equal, [
    deviceId,
    ...deps,
  ]);
}

export function useDeviceValue(deviceId: string, capability: string): DeviceValue | null {
  return useStoreSelector(
    (state) => deviceValuesOf(state, deviceId)[capability] ?? null,
    Object.is,
    [deviceId, capability],
  );
}

export function useRooms(): readonly TableRow<'rooms'>[] {
  return useRows('rooms');
}

function roomCountIn(state: StoreState): number {
  return state.tables.rooms.ids.length;
}

export function useRoomCount(): number {
  return useStoreSelector(roomCountIn);
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
  state.tables.ir_remotes,
  state.tables.provider_links,
];

export const availabilityOf = memoOnInputs(availabilityInputs, (state): Availability => {
  const devices = rowsOf(state.tables.devices).filter((device) => !device.hidden);
  return {
    hasDevices: devices.length > 0,
    hasClimate: devices.some(isClimateDevice),
    hasCameras: devices.some(isCamera),
    hasHealth:
      state.tables.health_daily.ids.length > 0 ||
      state.tables.health_sources.ids.length > 0 ||
      devices.some((device) => isWearable(device) || isScale(device)),
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
