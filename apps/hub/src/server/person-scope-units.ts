import {
  areaInScope,
  deviceInScope,
  modelInScope,
  type ClientRow,
  type DeviceScope,
  type McpToolArea,
  type ReachScopes,
} from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import { profileIdOf, type Caller } from './auth';
import type { Refusal } from './person-access';
import {
  areaWhy,
  deviceHidden,
  deviceReachWhy,
  readableScopes,
  scopedCaller,
  type RouteScope,
} from './person-scope';
import { devicesPrivateToOthers } from './private-devices';

type ScopeStore = Pick<HostStore, 'personAccess' | 'localDevices' | 'devices'>;

export function scopesOf(store: ScopeStore, profileId: string): ReachScopes {
  const scopes = readableScopes(profileId, store.personAccess.scopes(profileId));
  return {
    ...scopes,
    devices: { ...scopes.devices, hidden: devicesPrivateToOthers(store, profileId) },
  };
}

export function scopesOfCaller(store: ScopeStore, caller: Caller): ReachScopes | null {
  return scopedCaller(caller) ? scopesOf(store, profileIdOf(caller)) : null;
}

export function scopesOfClient(
  store: ScopeStore & Pick<HostStore, 'profiles'>,
  client: Pick<ClientRow, 'id' | 'role'>,
): ReachScopes | null {
  return client.role === 'owner' ? null : scopesOf(store, store.profiles.activeOf(client.id).id);
}

export function deviceIdReachable(
  store: Pick<HostStore, 'devices'>,
  scope: DeviceScope | null,
  deviceId: string | null,
): boolean {
  if (scope === null || deviceId === null) return true;
  const device = store.devices.find(deviceId);
  return device !== undefined && deviceInScope(scope, device);
}

export function reachableRows<R>(
  store: Pick<HostStore, 'devices'>,
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

export function deviceScopeOf(store: ScopeStore, caller: Caller): DeviceScope | null {
  return scopesOfCaller(store, caller)?.devices ?? null;
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

export function toolAreaWhy(store: ScopeStore, caller: Caller, area: McpToolArea): Refusal | null {
  const scopes = scopesOfCaller(store, caller);
  return scopes !== null && !areaInScope(scopes, area) ? areaWhy(area) : null;
}

export function modelAllowed(store: HostStore, profileId: string, model: string): boolean {
  const standing = store.personAccess.standing(profileId);
  if (standing.known && standing.role === 'owner') return true;
  return modelInScope(scopesOf(store, profileId).models, model);
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

export const CALLER_SCOPES_UNIT = storeUnit((store, { caller }: { readonly caller: Caller }) =>
  scopesOfCaller(store, caller),
);
