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
import type { OwnerAlerts } from '../extensions/owner-alerts';
import type { Store } from '../store/store';

const log = new Logger('hub.access-requests');

const SETTINGS_PATH = '/settings/access';

export interface AccessRequestsOptions {
  readonly store: Store;
  readonly alerts: OwnerAlerts;
  readonly now: () => Date;
  readonly scopesChanged: (profileId: string) => void;
}

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

export function grantOf(
  store: Store,
  request: Pick<NewAccessRequest, 'kind' | 'target'>,
): AccessGrant {
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

export class AccessRequests {
  constructor(private readonly options: AccessRequestsOptions) {}

  list(profileId: string | null, status?: AccessRequestRow['status']): AccessRequestRow[] {
    return this.options.store.accessRequests.list(status, profileId ?? undefined);
  }

  create(profileId: string, request: NewAccessRequest): AccessRequestRow {
    const { store, alerts } = this.options;
    const access = store.personAccess.byProfile(profileId);
    if (access.role === 'owner') throw refusal('An owner already has everything.');
    if (request.target !== null) this.assertWorthAsking(profileId, request);
    const pending = store.accessRequests.list('pending', profileId);
    if (pending.some((one) => sameThing(one, request))) {
      throw refusal('You already asked for that; the owner has not answered yet.');
    }
    const row = store.accessRequests.create(profileId, request);
    const name = store.profiles.byId(profileId).name;
    alerts.raise({
      title: `${name} asks for more access`,
      body: request.note === '' ? this.wording(request) : request.note,
      data: { kind: 'access_request', requestId: row.id, path: SETTINGS_PATH },
    });
    log.info('access_request.created', { requestId: row.id, profileId, kind: request.kind });
    return row;
  }

  decide(requestId: string, by: string, decision: AccessRequestDecision): AccessRequestRow {
    const { store } = this.options;
    const row = store.write(() =>
      decision.approve ? this.approve(requestId, by, decision) : this.deny(requestId, by, decision),
    );
    this.options.scopesChanged(row.profile_id);
    this.options.alerts.raise({
      title: decision.approve ? 'Your request was approved' : 'Your request was denied',
      body: this.wording(row),
      data: { kind: 'access_request_decided', requestId: row.id, path: SETTINGS_PATH },
      person: row.profile_id,
    });
    log.info('access_request.decided', { requestId, approved: decision.approve });
    return row;
  }

  lapse(): readonly string[] {
    const { store, now } = this.options;
    const due = store.accessRequests.lapsing(now().toISOString());
    const touched = due.flatMap((row) => this.lapseOne(row));
    for (const profileId of new Set(touched)) this.options.scopesChanged(profileId);
    return touched;
  }

  changeByOwner(profileId: string, change: PersonAccessChange): PersonAccess {
    const { personAccess } = this.options.store;
    const before = personAccess.byProfile(profileId);
    const after = personAccess.change(profileId, change);
    if (change.scopes !== undefined) this.keepWhatOwnerSet(profileId);
    if (change.budget !== undefined) this.budgetSetByOwner(profileId, before.budget);
    return after;
  }

  budgetSetByOwner(profileId: string, before: PersonAccess['budget']): void {
    const { store } = this.options;
    const after = store.personAccess.byProfile(profileId).budget;
    const sameLimits =
      before?.daily_usd === after?.daily_usd && before?.monthly_usd === after?.monthly_usd;
    if (sameLimits) return;
    store.write(() => {
      for (const row of store.accessRequests.list('approved', profileId)) {
        if (row.kind !== 'budget' || row.until === null || row.lapsed_at !== null) continue;
        store.accessRequests.markLapsed(row.id);
        const grant = this.endedGrantOf(row);
        if (grant === undefined) continue;
        this.record(
          profileId,
          null,
          `Replaced by the AI budget the owner set: ${describe(store, grant)}`,
        );
      }
    });
  }

  keepWhatOwnerSet(profileId: string): void {
    const { store } = this.options;
    store.write(() => {
      for (const row of store.accessRequests.list('approved', profileId)) {
        if (row.until === null || row.lapsed_at !== null || row.kind === 'budget') continue;
        const grant = this.endedGrantOf(row);
        if (grant === undefined) continue;
        if (grantAccess(store.personAccess.byProfile(profileId), grant).kind !== 'unchanged') {
          continue;
        }
        store.accessRequests.keepForGood(row.id);
        this.record(profileId, null, `Kept for good by the owner: ${describe(store, grant)}`);
      }
    });
  }

  private wording(request: Pick<NewAccessRequest, 'kind' | 'target'>): string {
    if (request.target === null) return `Asked for more: ${request.kind}.`;
    try {
      return `Asked for ${describe(this.options.store, grantOf(this.options.store, request))}.`;
    } catch (cause) {
      log.warn('access_request.unreadable_target', { kind: request.kind, reason: String(cause) });
      return `Asked for more: ${request.kind}.`;
    }
  }

  private assertWorthAsking(profileId: string, request: NewAccessRequest): void {
    const { store } = this.options;
    const outcome = grantAccess(store.personAccess.byProfile(profileId), grantOf(store, request));
    if (outcome.kind === 'unchanged') throw refusal('You already have that.');
    if (outcome.kind === 'refused') throw refusal(outcome.reason);
  }

  private approve(
    requestId: string,
    by: string,
    decision: AccessRequestDecision,
  ): AccessRequestRow {
    const { store, now } = this.options;
    const before = store.accessRequests.byId(requestId);
    const target = targetOf(before, decision);
    const grant = grantOf(store, { kind: before.kind, target });
    if (decision.until !== null && Date.parse(decision.until) <= now().getTime()) {
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
      this.record(before.profile_id, by, `Approved ${describe(store, grant)}`);
    }
    return store.accessRequests.decide(requestId, by, {
      ...decision,
      target,
      until: outcome.kind === 'changed' ? decision.until : null,
    });
  }

  private deny(requestId: string, by: string, decision: AccessRequestDecision): AccessRequestRow {
    const { accessRequests } = this.options.store;
    const target = targetOf(accessRequests.byId(requestId), decision);
    return accessRequests.decide(requestId, by, { ...decision, target });
  }

  private lapseOne(row: AccessRequestRow): readonly string[] {
    const { store, now } = this.options;
    return store.write(() => {
      store.accessRequests.markLapsed(row.id);
      if (this.stillGranted(row, now().toISOString())) return [];
      const grant = this.endedGrantOf(row);
      if (grant === undefined) return [];
      const after = withdrawAccess(store.personAccess.byProfile(row.profile_id), grant);
      store.personAccess.change(row.profile_id, { scopes: after.scopes, budget: after.budget });
      this.record(row.profile_id, null, `Temporary access ended: ${describe(store, grant)}`);
      return [row.profile_id];
    });
  }

  private endedGrantOf(row: AccessRequestRow): AccessGrant | undefined {
    try {
      return grantOf(this.options.store, row);
    } catch (cause) {
      if (!(cause instanceof ApiError)) throw cause;
      log.warn('access_request.lapse_skipped', { requestId: row.id, reason: cause.message });
      return undefined;
    }
  }

  private stillGranted(row: AccessRequestRow, now: string): boolean {
    if (row.kind === 'budget') return false;
    return this.options.store.accessRequests
      .list('approved', row.profile_id)
      .some(
        (other) =>
          other.id !== row.id &&
          other.lapsed_at === null &&
          sameThing(other, row) &&
          (other.until === null || other.until > now),
      );
  }

  private record(profileId: string, by: string | null, detail: string): void {
    this.options.store.accessAudit.record({
      profile_id: profileId,
      client_id: by,
      kind: 'scopes_changed',
      detail,
    });
  }
}
