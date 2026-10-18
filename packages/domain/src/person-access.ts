import { z } from 'zod';
import { AI_BUDGET_SETTINGS } from './ai-budget';
import { AI_MODEL_ID } from './ai-models';
import { ID, MOMENT, type Role } from './api/primitives';
import { MCP_TOOL_AREAS, type McpToolArea } from './mcp/areas';
import { QUIET_HOURS } from './reach';

export const PERSON_ROLES = ['owner', 'member', 'guest'] as const;

export const PERSON_ROLE = z.enum(PERSON_ROLES);

export type PersonRole = z.infer<typeof PERSON_ROLE>;

export const PERSON_TEMPLATES = ['owner', 'adult', 'child', 'guest'] as const;

export const PERSON_TEMPLATE = z.enum(PERSON_TEMPLATES);

export type PersonTemplate = z.infer<typeof PERSON_TEMPLATE>;

const IDS = z.array(ID).max(500);

export const DEVICE_SCOPE = z.strictObject({
  mode: z.enum(['all', 'only', 'except']),
  rooms: IDS,
  devices: IDS,
});

export type DeviceScope = z.output<typeof DEVICE_SCOPE>;

export const MODEL_SCOPE = z.strictObject({
  mode: z.enum(['default', 'only']),
  ids: z.array(AI_MODEL_ID).max(200),
});

export type ModelScope = z.output<typeof MODEL_SCOPE>;

export const CHANNEL_SCOPE = z.strictObject({
  mode: z.enum(['all', 'only']),
  ids: IDS,
});

export type ChannelScope = z.output<typeof CHANNEL_SCOPE>;

export const ACCESS_SCOPES = z.strictObject({
  areas: z.array(z.enum(MCP_TOOL_AREAS)).max(MCP_TOOL_AREAS.length),
  devices: DEVICE_SCOPE,
  models: MODEL_SCOPE,
  channels: CHANNEL_SCOPE,
});

export type AccessScopes = z.output<typeof ACCESS_SCOPES>;

export const PERSON_BUDGET = AI_BUDGET_SETTINGS.omit({ burn: true, low_credits_usd: true });

export type PersonBudget = z.output<typeof PERSON_BUDGET>;

export const ACCESS_CONDITIONS = z.strictObject({
  home_only: z.boolean(),
  schedule: QUIET_HOURS.nullable(),
});

export type AccessConditions = z.output<typeof ACCESS_CONDITIONS>;

export const NO_CONDITIONS: AccessConditions = { home_only: false, schedule: null };

const EVERYWHERE: AccessScopes = {
  areas: [...MCP_TOOL_AREAS],
  devices: { mode: 'all', rooms: [], devices: [] },
  models: { mode: 'default', ids: [] },
  channels: { mode: 'all', ids: [] },
};

const REFUSED_AREAS: Readonly<Record<'child' | 'guest', readonly McpToolArea[]>> = {
  child: ['settings', 'people', 'plugins', 'system', 'computers', 'automations'],
  guest: ['settings', 'people', 'plugins', 'system', 'computers', 'automations', 'health'],
};

function without(refused: readonly McpToolArea[]): AccessScopes {
  return { ...EVERYWHERE, areas: MCP_TOOL_AREAS.filter((area) => !refused.includes(area)) };
}

export const TEMPLATE_SCOPES: Readonly<Record<PersonTemplate, AccessScopes>> = {
  owner: EVERYWHERE,
  adult: EVERYWHERE,
  child: without(REFUSED_AREAS.child),
  guest: without(REFUSED_AREAS.guest),
};

export const PERSON_ACCESS = z.strictObject({
  profile_id: ID,
  role: PERSON_ROLE,
  template: PERSON_TEMPLATE,
  scopes: ACCESS_SCOPES,
  budget: PERSON_BUDGET.nullable(),
  conditions: ACCESS_CONDITIONS,
  expires_at: MOMENT.nullable(),
  updated_at: MOMENT,
});

export type PersonAccess = z.output<typeof PERSON_ACCESS>;

export const PERSON_ACCESS_CHANGE = z
  .strictObject({
    role: PERSON_ROLE,
    template: PERSON_TEMPLATE,
    scopes: ACCESS_SCOPES,
    budget: PERSON_BUDGET.nullable(),
    conditions: ACCESS_CONDITIONS,
    expires_at: MOMENT.nullable(),
  })
  .partial()
  .refine((change) => Object.keys(change).length > 0, {
    message: 'name at least one field to change',
  });

export type PersonAccessChange = z.output<typeof PERSON_ACCESS_CHANGE>;

export function effectiveRoleOf(device: Role, person: PersonRole): Role {
  return device === 'owner' && person === 'owner' ? 'owner' : 'member';
}

export function areaInScope(scopes: Pick<AccessScopes, 'areas'>, area: McpToolArea): boolean {
  return scopes.areas.includes(area);
}

export function deviceInScope(
  scope: DeviceScope,
  device: { readonly id: string; readonly room_id: string | null },
): boolean {
  if (scope.mode === 'all') return true;
  const named =
    scope.devices.includes(device.id) ||
    (device.room_id !== null && scope.rooms.includes(device.room_id));
  return scope.mode === 'only' ? named : !named;
}

export function modelInScope(scope: ModelScope, model: string): boolean {
  return scope.mode === 'default' || scope.ids.some((id) => id === model);
}

export function channelInScope(scope: ChannelScope, channelId: string): boolean {
  return scope.mode === 'all' || scope.ids.includes(channelId);
}

export const NOTHING_IN_SCOPE: AccessScopes = {
  areas: [],
  devices: { mode: 'only', rooms: [], devices: [] },
  models: { mode: 'only', ids: [] },
  channels: { mode: 'only', ids: [] },
};

export function isExpired(access: Pick<PersonAccess, 'expires_at'>, now: string): boolean {
  return access.expires_at !== null && Date.parse(access.expires_at) <= Date.parse(now);
}

export const ACCESS_AUDIT_KINDS = [
  'refused_scope',
  'refused_condition',
  'refused_budget',
  'refused_expired',
  'role_changed',
  'scopes_changed',
  'pairing_started',
  'person_revoked',
] as const;

export const ACCESS_AUDIT_KIND = z.enum(ACCESS_AUDIT_KINDS);

export type AccessAuditKind = z.infer<typeof ACCESS_AUDIT_KIND>;

export const ACCESS_AUDIT_DETAIL_MAX = 500;

export const ACCESS_AUDIT_ENTRY = z.strictObject({
  profile_id: ID.nullable(),
  client_id: ID.nullable(),
  kind: ACCESS_AUDIT_KIND,
  detail: z.string().trim().min(1).max(ACCESS_AUDIT_DETAIL_MAX),
});

export type AccessAuditEntry = z.output<typeof ACCESS_AUDIT_ENTRY>;

export const ACCESS_AUDIT_ROW = ACCESS_AUDIT_ENTRY.extend({ id: ID, at: MOMENT });

export type AccessAuditRow = z.output<typeof ACCESS_AUDIT_ROW>;

export const ACCESS_REQUEST_KINDS = ['area', 'device', 'model', 'budget'] as const;

export const ACCESS_REQUEST_KIND = z.enum(ACCESS_REQUEST_KINDS);

export type AccessRequestKind = z.infer<typeof ACCESS_REQUEST_KIND>;

export const ACCESS_REQUEST_STATUSES = ['pending', 'approved', 'denied'] as const;

export const ACCESS_REQUEST_STATUS = z.enum(ACCESS_REQUEST_STATUSES);

export type AccessRequestStatus = z.infer<typeof ACCESS_REQUEST_STATUS>;

export const ACCESS_REQUEST_NOTE_MAX = 500;

export const NEW_ACCESS_REQUEST = z.strictObject({
  kind: ACCESS_REQUEST_KIND,
  target: z.string().trim().min(1).max(200).nullable(),
  note: z.string().trim().max(ACCESS_REQUEST_NOTE_MAX),
});

export type NewAccessRequest = z.output<typeof NEW_ACCESS_REQUEST>;

export const ACCESS_REQUEST_DECISION = z.strictObject({
  approve: z.boolean(),
  until: MOMENT.nullable(),
});

export type AccessRequestDecision = z.output<typeof ACCESS_REQUEST_DECISION>;

export const ACCESS_REQUEST_ROW = NEW_ACCESS_REQUEST.extend({
  id: ID,
  profile_id: ID,
  status: ACCESS_REQUEST_STATUS,
  until: MOMENT.nullable(),
  requested_at: MOMENT,
  decided_at: MOMENT.nullable(),
  decided_by: ID.nullable(),
});

export type AccessRequestRow = z.output<typeof ACCESS_REQUEST_ROW>;
