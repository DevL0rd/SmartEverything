import {
  MCP_TOOL_AREA_LABELS,
  type ApiError,
  NOTHING_IN_SCOPE,
  areaInScope,
  channelInScope,
  deviceInScope,
  modelInScope,
  endpointAccessArea,
  type AccessScopes,
  type ChannelScope,
  type ClientRow,
  type DeviceRow,
  type DeviceScope,
  type EndpointShape,
  type McpToolArea,
  type ReachScopes,
  type TalkPresence,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { profileIdOf, roleOfCaller, type Caller } from './auth';
import { devicesPrivateToOthers } from './private-devices';
import { refusal, type Refusal, type Subject } from './person-access';
import { storeUnit } from '../store/host/unit';
import { RepeatGate } from './repeat-gate';

const log = new Logger('hub.person-scope');

const UNREADABLE_REPEAT_MS = 3_600_000;

const unreadable = new RepeatGate(UNREADABLE_REPEAT_MS);

class ScopesUnreadableError extends Error {
  override readonly name = 'ScopesUnreadableError';

  constructor(profileId: string) {
    super(
      `The stored limits of person ${profileId} are missing or unreadable; they get no access.`,
    );
  }
}

type ScopeStore = Pick<Store, 'personAccess' | 'localDevices' | 'devices'>;

function storedScopesOf(store: Pick<Store, 'personAccess'>, profileId: string): AccessScopes {
  const scopes = store.personAccess.scopes(profileId);
  if (scopes !== undefined) return scopes;
  if (unreadable.pass(profileId) !== null) {
    log.error('access.scopes_unreadable', new ScopesUnreadableError(profileId), { profileId });
  }
  return NOTHING_IN_SCOPE;
}

export function scopesOf(store: ScopeStore, profileId: string): ReachScopes {
  const scopes = storedScopesOf(store, profileId);
  return {
    ...scopes,
    devices: { ...scopes.devices, hidden: devicesPrivateToOthers(store, profileId) },
  };
}

export function scopedCaller(caller: Caller): boolean {
  return caller.kind !== 'anonymous' && roleOfCaller(caller) !== 'owner';
}

export function scopesOfCaller(store: ScopeStore, caller: Caller): ReachScopes | null {
  return scopedCaller(caller) ? scopesOf(store, profileIdOf(caller)) : null;
}

export function scopesOfClient(
  store: ScopeStore & Pick<Store, 'profiles'>,
  client: Pick<ClientRow, 'id' | 'role'>,
): ReachScopes | null {
  return client.role === 'owner' ? null : scopesOf(store, store.profiles.activeOf(client.id).id);
}

export function subjectOf(caller: Caller): Subject {
  if (caller.kind === 'client') return caller.client;
  if (caller.kind === 'service') return { id: null, profile_id: caller.profileId };
  return { id: null, profile_id: null };
}

export function deviceHidden(
  scope: DeviceScope | null,
  device: Pick<DeviceRow, 'id' | 'room_id'>,
): boolean {
  return scope !== null && !deviceInScope(scope, device);
}

export function deviceIdReachable(
  store: Pick<Store, 'devices'>,
  scope: DeviceScope | null,
  deviceId: string | null,
): boolean {
  if (scope === null || deviceId === null) return true;
  const device = store.devices.find(deviceId);
  return device !== undefined && deviceInScope(scope, device);
}

export function reachableRows<R>(
  store: Pick<Store, 'devices'>,
  scope: DeviceScope | null,
  rows: readonly R[],
  deviceOf: (row: R) => string | null,
): R[] {
  if (scope === null) return [...rows];
  const devices = new Map(store.devices.list().map((device) => [device.id, device] as const));
  return rows.filter((row) => {
    const id = deviceOf(row);
    if (id === null) return true;
    const device = devices.get(id);
    return device !== undefined && deviceInScope(scope, device);
  });
}

export interface ReachableAsk {
  readonly caller: Caller;
  readonly deviceIds: readonly string[];
}

export const REACHABLE_DEVICES_UNIT = storeUnit(
  (store, { caller, deviceIds }: ReachableAsk): string[] => {
    const scope = deviceScopeOf(store, caller);
    return deviceIds.filter((id) => deviceIdReachable(store, scope, id));
  },
);

export async function reachableFor<R>(
  store: Pick<Store, 'host'>,
  caller: Caller,
  rows: readonly R[],
  deviceOf: (row: R) => string | null,
): Promise<R[]> {
  if (!scopedCaller(caller)) return [...rows];
  const deviceIds = [...new Set(rows.map(deviceOf).filter((id): id is string => id !== null))];
  const reachable = new Set(await store.host.read('reachableDevices', { caller, deviceIds }));
  return rows.filter((row) => {
    const id = deviceOf(row);
    return id === null || reachable.has(id);
  });
}

export function deviceScopeOf(store: ScopeStore, caller: Caller): DeviceScope | null {
  return scopesOfCaller(store, caller)?.devices ?? null;
}

export function assertDeviceReach(
  store: Store,
  who: Subject,
  scope: DeviceScope | null,
  device: Pick<DeviceRow, 'id' | 'room_id'>,
): void {
  if (!deviceHidden(scope, device)) return;
  throw refusal(store, who, deviceReachWhy(device.id));
}

export function devicesReachWhy(
  store: ScopeStore,
  caller: Caller,
  devices: readonly string[],
): Refusal | null {
  const scope = scopesOfCaller(store, caller)?.devices ?? null;
  if (scope === null) return null;
  for (const id of devices) {
    const device = store.devices.find(id);
    if (device !== undefined && deviceHidden(scope, device)) return deviceReachWhy(device.id);
  }
  return null;
}

export function assertDevicesReach(store: Store, caller: Caller, devices: readonly string[]): void {
  const why = devicesReachWhy(store, caller, devices);
  if (why !== null) throw refusal(store, subjectOf(caller), why);
}

function areaRefusal(store: Store, caller: Caller, area: McpToolArea): ApiError {
  return refusal(store, subjectOf(caller), areaWhy(area));
}

function areaWhy(area: McpToolArea): Refusal {
  return {
    kind: 'refused_scope',
    detail: `the ${area} area is not part of the person's access`,
    message: `${MCP_TOOL_AREA_LABELS[area]} is not part of your access; ask the owner.`,
  };
}

export function deviceReachWhy(deviceId: string): Refusal {
  return {
    kind: 'refused_scope',
    detail: `a device outside the person's devices was asked for: ${deviceId}`,
    message: 'That device is not part of your access; ask the owner.',
  };
}

export interface RouteScope {
  readonly caller: Caller;
  readonly area: McpToolArea | null;
  readonly deviceId: string | null;
}

function routeScopeWhy(store: ScopeStore, { caller, area, deviceId }: RouteScope): Refusal | null {
  const scopes = scopesOfCaller(store, caller);
  if (scopes === null) return null;
  if (area !== null && !areaInScope(scopes, area)) return areaWhy(area);
  if (deviceId === null) return null;
  const device = store.devices.find(deviceId);
  return device !== undefined && deviceHidden(scopes.devices, device)
    ? deviceReachWhy(device.id)
    : null;
}

export const ROUTE_SCOPE_UNIT = storeUnit((store, input: RouteScope) =>
  routeScopeWhy(store, input),
);

export async function assertScopeRoute(
  store: Store,
  caller: Caller,
  endpoint: EndpointShape,
  params: Readonly<Record<string, string>>,
): Promise<void> {
  if (!scopedCaller(caller)) return;
  const why = await store.host.read('routeScope', {
    caller,
    area: endpointAccessArea(endpoint),
    deviceId: params['deviceId'] ?? null,
  });
  if (why !== null) throw refusal(store, subjectOf(caller), why);
}

export function assertToolArea(store: Store, caller: Caller, area: McpToolArea): void {
  const scopes = scopesOfCaller(store, caller);
  if (scopes !== null && !areaInScope(scopes, area)) throw areaRefusal(store, caller, area);
}

export function modelAllowed(store: Store, profileId: string, model: string): boolean {
  const standing = store.personAccess.standing(profileId);
  if (standing.known && standing.role === 'owner') return true;
  return modelInScope(scopesOf(store, profileId).models, model);
}

export function assertModelAllowed(store: Store, profileId: string, model: string): void {
  if (modelAllowed(store, profileId, model)) return;
  throw refusal(
    store,
    { id: null, profile_id: profileId },
    {
      kind: 'refused_scope',
      detail: `the model ${model} is not one of the person's models`,
      message: `The owner limited which AI models you can use, and ${model} is not one of them.`,
    },
  );
}

export function channelHidden(scope: ChannelScope | null, channelId: string): boolean {
  return scope !== null && !channelInScope(scope, channelId);
}

export const CALLER_SCOPES_UNIT = storeUnit((store, { caller }: { readonly caller: Caller }) =>
  scopesOfCaller(store, caller),
);

export async function callerScopes(
  store: Pick<Store, 'host'>,
  caller: Caller,
): Promise<ReachScopes | null> {
  return scopedCaller(caller) ? store.host.read('callerScopes', { caller }) : null;
}

export function assertChannelReach(
  store: Pick<Store, 'host'>,
  caller: Caller,
  scope: ChannelScope | null,
  channelId: string,
): void {
  if (!channelHidden(scope, channelId)) return;
  throw refusal(store, subjectOf(caller), {
    kind: 'refused_scope',
    detail: `a channel outside the person's channels was asked for: ${channelId}`,
    message: 'That walkie-talkie channel is not part of your access; ask the owner.',
  });
}

export function presenceInScope(scope: ChannelScope | null, presence: TalkPresence): TalkPresence {
  if (scope === null) return presence;
  return {
    ...presence,
    floors: presence.floors.filter((floor) => !channelHidden(scope, floor.channelId)),
  };
}
