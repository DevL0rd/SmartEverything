import {
  AI_MODEL_ID,
  ApiError,
  MCP_TOOL_AREAS,
  MCP_TOOL_AREA_LABELS,
  grantAccess,
  withdrawAccess,
  type AccessGrant,
  type AccessRequestDecision,
  type AccessRequestRow,
  type NewAccessRequest,
  type PersonAccess,
  type PersonAccessChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';

const log = new Logger('hub.access-requests');

function refusal(message: string): ApiError {
  return new ApiError('conflict', message);
}

function areaOf(target: string): AccessGrant {
  const area = MCP_TOOL_AREAS.find((one) => one === target);
  if (area === undefined) {
    throw new ApiError(
      'invalid_request',
      `${target} is not an area; the areas are ${MCP_TOOL_AREAS.join(', ')}.`,
    );
  }
  return { kind: 'area', area };
}

function placeOf(store: Store, target: string): AccessGrant {
  const device = store.devices.find(target);
  if (device !== undefined) return { kind: 'device', deviceId: device.id, roomId: device.room_id };
  if (store.rooms.list().some((room) => room.id === target)) {
    return { kind: 'room', roomId: target };
  }
  throw new ApiError('not_found', 'No device or room has that id.');
}

function amountOf(target: string): AccessGrant {
  const usd = Number(target);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new ApiError('invalid_request', 'Name the extra AI budget in dollars, for example 5.');
  }
  return { kind: 'budget', usd };
}

function grantOf(store: Store, request: Pick<NewAccessRequest, 'kind' | 'target'>): AccessGrant {
  const { kind, target } = request;
  if (target === null) {
    throw new ApiError(
      'invalid_request',
      'Name what to grant: an area, a device or room id, a model id or an amount.',
    );
  }
  switch (kind) {
    case 'area':
      return areaOf(target);
    case 'device':
      return placeOf(store, target);
    case 'model':
      return { kind: 'model', modelId: AI_MODEL_ID.parse(target) };
    case 'budget':
      return amountOf(target);
  }
}

function targetOf(before: AccessRequestRow, decision: AccessRequestDecision): string | null {
  if (before.target !== null && decision.target !== null && decision.target !== before.target) {
    throw new ApiError('invalid_request', 'The request already names its target.');
  }
  return decision.target ?? before.target;
}

function describe(store: Store, grant: AccessGrant): string {
  switch (grant.kind) {
    case 'area':
      return MCP_TOOL_AREA_LABELS[grant.area];
    case 'device':
      return store.devices.find(grant.deviceId)?.name ?? 'a device';
    case 'room':
      return store.rooms.list().find((room) => room.id === grant.roomId)?.name ?? 'a room';
    case 'model':
      return grant.modelId;
    case 'budget':
      return `${String(grant.usd)} dollars more AI budget`;
  }
}

function sameThing(left: Pick<AccessRequestRow, 'kind' | 'target'>, right: typeof left): boolean {
  return left.kind === right.kind && left.target === right.target;
}

function wording(store: Store, request: Pick<NewAccessRequest, 'kind' | 'target'>): string {
  if (request.target === null) return `Asked for more: ${request.kind}.`;
  try {
    return `Asked for ${describe(store, grantOf(store, request))}.`;
  } catch (cause) {
    log.warn('access_request.unreadable_target', { kind: request.kind, reason: String(cause) });
    return `Asked for more: ${request.kind}.`;
  }
}

function record(store: Store, profileId: string, by: string | null, detail: string): void {
  store.accessAudit.record({
    profile_id: profileId,
    client_id: by,
    kind: 'scopes_changed',
    detail,
  });
}

function endedGrantOf(store: Store, row: AccessRequestRow): AccessGrant | undefined {
  try {
    return grantOf(store, row);
  } catch (cause) {
    if (!(cause instanceof ApiError)) throw cause;
    log.warn('access_request.lapse_skipped', { requestId: row.id, reason: cause.message });
    return undefined;
  }
}

function stillGranted(store: Store, row: AccessRequestRow, now: string): boolean {
  if (row.kind === 'budget') return false;
  return store.accessRequests
    .list('approved', row.profile_id)
    .some(
      (other) =>
        other.id !== row.id &&
        other.lapsed_at === null &&
        sameThing(other, row) &&
        (other.until === null || other.until > now),
    );
}

function assertWorthAsking(store: Store, profileId: string, request: NewAccessRequest): void {
  const outcome = grantAccess(store.personAccess.byProfile(profileId), grantOf(store, request));
  if (outcome.kind === 'unchanged') throw refusal('You already have that.');
  if (outcome.kind === 'refused') throw refusal(outcome.reason);
}

export interface Decision {
  readonly requestId: string;
  readonly by: string;
  readonly decision: AccessRequestDecision;
  readonly now: string;
}

function approve(store: Store, { requestId, by, decision, now }: Decision): AccessRequestRow {
  const before = store.accessRequests.byId(requestId);
  const target = targetOf(before, decision);
  const grant = grantOf(store, { kind: before.kind, target });
  if (decision.until !== null && Date.parse(decision.until) <= Date.parse(now)) {
    throw new ApiError('invalid_request', 'The end time has to be in the future.');
  }
  const access = store.personAccess.byProfile(before.profile_id);
  if (access.role === 'owner') throw refusal('An owner already has everything.');
  const outcome = grantAccess(access, grant);
  if (outcome.kind === 'refused') throw refusal(outcome.reason);
  if (outcome.kind === 'changed') {
    store.personAccess.change(before.profile_id, {
      scopes: outcome.access.scopes,
      budget: outcome.access.budget,
    });
    record(store, before.profile_id, by, `Approved ${describe(store, grant)}`);
  }
  return store.accessRequests.decide(requestId, by, {
    ...decision,
    target,
    until: outcome.kind === 'changed' ? decision.until : null,
  });
}

function deny(store: Store, { requestId, by, decision }: Decision): AccessRequestRow {
  const target = targetOf(store.accessRequests.byId(requestId), decision);
  return store.accessRequests.decide(requestId, by, { ...decision, target });
}

function lapseOne(store: Store, row: AccessRequestRow, now: string): readonly string[] {
  store.accessRequests.markLapsed(row.id);
  if (stillGranted(store, row, now)) return [];
  const grant = endedGrantOf(store, row);
  if (grant === undefined) return [];
  const after = withdrawAccess(store.personAccess.byProfile(row.profile_id), grant);
  store.personAccess.change(row.profile_id, { scopes: after.scopes, budget: after.budget });
  record(store, row.profile_id, null, `Temporary access ended: ${describe(store, grant)}`);
  return [row.profile_id];
}

function sameLimits(before: PersonAccess['budget'], after: PersonAccess['budget']): boolean {
  return before?.daily_usd === after?.daily_usd && before?.monthly_usd === after?.monthly_usd;
}

function budgetSetByOwner(store: Store, profileId: string, before: PersonAccess['budget']): void {
  if (sameLimits(before, store.personAccess.byProfile(profileId).budget)) return;
  for (const row of store.accessRequests.list('approved', profileId)) {
    if (row.kind !== 'budget' || row.until === null || row.lapsed_at !== null) continue;
    store.accessRequests.markLapsed(row.id);
    const grant = endedGrantOf(store, row);
    if (grant === undefined) continue;
    record(
      store,
      profileId,
      null,
      `Replaced by the AI budget the owner set: ${describe(store, grant)}`,
    );
  }
}

function keepWhatOwnerSet(store: Store, profileId: string): void {
  for (const row of store.accessRequests.list('approved', profileId)) {
    if (row.until === null || row.lapsed_at !== null || row.kind === 'budget') continue;
    const grant = endedGrantOf(store, row);
    if (grant === undefined) continue;
    if (grantAccess(store.personAccess.byProfile(profileId), grant).kind !== 'unchanged') {
      continue;
    }
    store.accessRequests.keepForGood(row.id);
    record(store, profileId, null, `Kept for good by the owner: ${describe(store, grant)}`);
  }
}

export interface CreatedAccessRequest {
  readonly row: AccessRequestRow;
  readonly name: string;
  readonly wording: string;
}

export interface DecidedAccessRequest {
  readonly row: AccessRequestRow;
  readonly wording: string;
}

export const ACCESS_READ_UNITS = {
  accessRequestList: storeUnit(
    (
      store,
      input: {
        readonly profileId: string | null;
        readonly status: AccessRequestRow['status'] | null;
      },
    ) => store.accessRequests.list(input.status ?? undefined, input.profileId ?? undefined),
  ),
} as const;

export const ACCESS_WRITE_UNITS = {
  accessRequestCreate: storeUnit(
    (
      store,
      { profileId, request }: { readonly profileId: string; readonly request: NewAccessRequest },
    ): CreatedAccessRequest => {
      const access = store.personAccess.byProfile(profileId);
      if (access.role === 'owner') throw refusal('An owner already has everything.');
      if (request.target !== null) assertWorthAsking(store, profileId, request);
      const pending = store.accessRequests.list('pending', profileId);
      if (pending.some((one) => sameThing(one, request))) {
        throw refusal('You already asked for that; the owner has not answered yet.');
      }
      const row = store.accessRequests.create(profileId, request);
      return { row, name: store.profiles.byId(profileId).name, wording: wording(store, request) };
    },
  ),
  accessRequestDecide: storeUnit((store, input: Decision): DecidedAccessRequest => {
    const row = input.decision.approve ? approve(store, input) : deny(store, input);
    return { row, wording: wording(store, row) };
  }),
  accessRequestsLapse: storeUnit((store, { now }: { readonly now: string }) =>
    store.accessRequests.lapsing(now).flatMap((row) => lapseOne(store, row, now)),
  ),
  accessChangeByOwner: storeUnit(
    (
      store,
      { profileId, change }: { readonly profileId: string; readonly change: PersonAccessChange },
    ): PersonAccess => {
      const before = store.personAccess.byProfile(profileId);
      const after = store.personAccess.change(profileId, change);
      if (change.scopes !== undefined) keepWhatOwnerSet(store, profileId);
      if (change.budget !== undefined) budgetSetByOwner(store, profileId, before.budget);
      return after;
    },
  ),
} as const;
