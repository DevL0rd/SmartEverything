import { MCP_TOOL_AREAS, type McpToolArea } from './mcp/areas';
import type { AccessScopes, PersonAccess } from './person-access';

export type AccessGrant =
  | { readonly kind: 'area'; readonly area: McpToolArea }
  | { readonly kind: 'device'; readonly deviceId: string; readonly roomId: string | null }
  | { readonly kind: 'room'; readonly roomId: string }
  | { readonly kind: 'model'; readonly modelId: string }
  | { readonly kind: 'budget'; readonly usd: number };

export type Grantable = Pick<PersonAccess, 'scopes' | 'budget'>;

export type GrantOutcome =
  | { readonly kind: 'changed'; readonly access: Grantable }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly reason: string };

const CHANGED = (access: Grantable): GrantOutcome => ({ kind: 'changed', access });

const UNCHANGED: GrantOutcome = { kind: 'unchanged' };

const MICRO = 1_000_000;

function withScopes(access: Grantable, scopes: Partial<AccessScopes>): Grantable {
  return { ...access, scopes: { ...access.scopes, ...scopes } };
}

function plus(list: readonly string[], id: string): string[] {
  return list.includes(id) ? [...list] : [...list, id];
}

function minus(list: readonly string[], id: string): string[] {
  return list.filter((one) => one !== id);
}

function grantArea(access: Grantable, area: McpToolArea): GrantOutcome {
  if (access.scopes.areas.includes(area)) return UNCHANGED;
  const areas = MCP_TOOL_AREAS.filter((one) => one === area || access.scopes.areas.includes(one));
  return CHANGED(withScopes(access, { areas }));
}

function grantModel(access: Grantable, modelId: string): GrantOutcome {
  const { models } = access.scopes;
  if (models.mode === 'default' || models.ids.some((id) => id === modelId)) return UNCHANGED;
  const ids = [...models.ids, modelId];
  return CHANGED(withScopes(access, { models: { ...models, ids } }));
}

function grantRoom(access: Grantable, roomId: string): GrantOutcome {
  const { devices } = access.scopes;
  if (devices.mode === 'all') return UNCHANGED;
  if (devices.mode === 'only') {
    if (devices.rooms.includes(roomId)) return UNCHANGED;
    return CHANGED(
      withScopes(access, { devices: { ...devices, rooms: [...devices.rooms, roomId] } }),
    );
  }
  if (!devices.rooms.includes(roomId)) return UNCHANGED;
  return CHANGED(
    withScopes(access, { devices: { ...devices, rooms: minus(devices.rooms, roomId) } }),
  );
}

function grantDevice(
  access: Grantable,
  grant: Extract<AccessGrant, { kind: 'device' }>,
): GrantOutcome {
  const { devices } = access.scopes;
  const { deviceId, roomId } = grant;
  if (devices.mode === 'all') return UNCHANGED;
  if (devices.mode === 'only') {
    const named =
      devices.devices.includes(deviceId) || (roomId !== null && devices.rooms.includes(roomId));
    if (named) return UNCHANGED;
    return CHANGED(
      withScopes(access, { devices: { ...devices, devices: [...devices.devices, deviceId] } }),
    );
  }
  if (roomId !== null && devices.rooms.includes(roomId)) {
    return {
      kind: 'refused',
      reason: 'The whole room of that device is hidden from them; grant the room instead.',
    };
  }
  if (!devices.devices.includes(deviceId)) return UNCHANGED;
  return CHANGED(
    withScopes(access, { devices: { ...devices, devices: minus(devices.devices, deviceId) } }),
  );
}

function moved(limit: number | null, usd: number): number | null {
  return limit === null ? null : Math.max(0, Math.round((limit + usd) * MICRO) / MICRO);
}

function grantBudget(access: Grantable, usd: number): GrantOutcome {
  const { budget } = access;
  if (budget === null) return { kind: 'refused', reason: 'They have no AI budget limit to raise.' };
  if (budget.daily_usd === null && budget.monthly_usd === null) {
    return { kind: 'refused', reason: 'Their AI budget has no daily or monthly limit to raise.' };
  }
  return CHANGED({
    ...access,
    budget: {
      ...budget,
      daily_usd: moved(budget.daily_usd, usd),
      monthly_usd: moved(budget.monthly_usd, usd),
    },
  });
}

export function grantAccess(access: Grantable, grant: AccessGrant): GrantOutcome {
  switch (grant.kind) {
    case 'area':
      return grantArea(access, grant.area);
    case 'model':
      return grantModel(access, grant.modelId);
    case 'room':
      return grantRoom(access, grant.roomId);
    case 'device':
      return grantDevice(access, grant);
    case 'budget':
      return grantBudget(access, grant.usd);
  }
}

function withdrawDevices(
  access: Grantable,
  grant: Extract<AccessGrant, { kind: 'device' | 'room' }>,
): Grantable {
  const { devices } = access.scopes;
  if (devices.mode === 'all') return access;
  const only = devices.mode === 'only';
  if (grant.kind === 'room') {
    const rooms = only ? minus(devices.rooms, grant.roomId) : plus(devices.rooms, grant.roomId);
    return withScopes(access, { devices: { ...devices, rooms } });
  }
  const list = only
    ? minus(devices.devices, grant.deviceId)
    : plus(devices.devices, grant.deviceId);
  return withScopes(access, { devices: { ...devices, devices: list } });
}

export function withdrawAccess(access: Grantable, grant: AccessGrant): Grantable {
  switch (grant.kind) {
    case 'area':
      return withScopes(access, { areas: access.scopes.areas.filter((one) => one !== grant.area) });
    case 'model': {
      const { models } = access.scopes;
      const ids = models.ids.filter((id) => id !== grant.modelId);
      return withScopes(access, { models: { ...models, ids } });
    }
    case 'room':
    case 'device':
      return withdrawDevices(access, grant);
    case 'budget': {
      const { budget } = access;
      if (budget === null) return access;
      return {
        ...access,
        budget: {
          ...budget,
          daily_usd: moved(budget.daily_usd, -grant.usd),
          monthly_usd: moved(budget.monthly_usd, -grant.usd),
        },
      };
    }
  }
}
