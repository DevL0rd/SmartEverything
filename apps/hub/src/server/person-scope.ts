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
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { profileIdOf, roleOfCaller, type Caller } from './auth';
import { refusal, type Subject } from './person-access';
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

export function scopesOf(store: Pick<Store, 'personAccess'>, profileId: string): AccessScopes {
  const scopes = store.personAccess.scopes(profileId);
  if (scopes !== undefined) return scopes;
  if (unreadable.pass(profileId) !== null) {
    log.error('access.scopes_unreadable', new ScopesUnreadableError(profileId), { profileId });
  }
  return NOTHING_IN_SCOPE;
}

export function scopesOfCaller(store: Store, caller: Caller): AccessScopes | null {
  if (caller.kind === 'anonymous' || roleOfCaller(caller) === 'owner') return null;
  return scopesOf(store, profileIdOf(store, caller));
}

export function scopesOfClient(
  store: Pick<Store, 'personAccess' | 'profiles'>,
  client: Pick<ClientRow, 'id' | 'role'>,
): AccessScopes | null {
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

export function deviceScopeOf(store: Store, caller: Caller): DeviceScope | null {
  return scopesOfCaller(store, caller)?.devices ?? null;
}

export function assertDeviceReach(
  store: Store,
  who: Subject,
  scope: DeviceScope | null,
  device: Pick<DeviceRow, 'id' | 'room_id'>,
): void {
  if (!deviceHidden(scope, device)) return;
  throw refusal(store, who, {
    kind: 'refused_scope',
    detail: `a device outside the person's devices was asked for: ${device.id}`,
    message: 'That device is not part of your access; ask the owner.',
  });
}

export function assertDevicesReach(store: Store, caller: Caller, devices: readonly string[]): void {
  const scope = scopesOfCaller(store, caller)?.devices ?? null;
  if (scope === null) return;
  const who = subjectOf(caller);
  for (const id of devices) {
    const device = store.devices.find(id);
    if (device !== undefined) assertDeviceReach(store, who, scope, device);
  }
}

function areaRefusal(store: Store, caller: Caller, area: McpToolArea): ApiError {
  return refusal(store, subjectOf(caller), {
    kind: 'refused_scope',
    detail: `the ${area} area is not part of the person's access`,
    message: `${MCP_TOOL_AREA_LABELS[area]} is not part of your access; ask the owner.`,
  });
}

export function assertScopeRoute(
  store: Store,
  caller: Caller,
  endpoint: EndpointShape,
  params: Readonly<Record<string, string>>,
): void {
  const scopes = scopesOfCaller(store, caller);
  if (scopes === null) return;
  const area = endpointAccessArea(endpoint);
  if (area !== null && !areaInScope(scopes, area)) throw areaRefusal(store, caller, area);
  const deviceId = params['deviceId'];
  if (deviceId === undefined) return;
  const device = store.devices.find(deviceId);
  if (device !== undefined) {
    assertDeviceReach(store, subjectOf(caller), scopes.devices, device);
  }
}

export function assertToolArea(store: Store, caller: Caller, area: McpToolArea): void {
  const scopes = scopesOfCaller(store, caller);
  if (scopes !== null && !areaInScope(scopes, area)) throw areaRefusal(store, caller, area);
}

export function assertModelAllowed(store: Store, profileId: string, model: string): void {
  const standing = store.personAccess.standing(profileId);
  if (standing.known && standing.role === 'owner') return;
  if (modelInScope(scopesOf(store, profileId).models, model)) return;
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

export function assertChannelReach(store: Store, caller: Caller, channelId: string): void {
  const scope = scopesOfCaller(store, caller)?.channels ?? null;
  if (!channelHidden(scope, channelId)) return;
  throw refusal(store, subjectOf(caller), {
    kind: 'refused_scope',
    detail: `a channel outside the person's channels was asked for: ${channelId}`,
    message: 'That walkie-talkie channel is not part of your access; ask the owner.',
  });
}
