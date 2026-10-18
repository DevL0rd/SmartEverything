import {
  ApiError,
  effectiveRoleOf,
  isExpired,
  localClock,
  type AccessAuditKind,
  type ClientRow,
  type PersonRole,
  type QuietHours,
  type Role,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { IncomingMessage } from 'node:http';
import type { Store } from '../store/store';
import { insideQuiet } from '../reach/reach-rules';
import type { KnownStanding, PersonStanding } from '../store/repositories/person-access';
import { remoteOf } from './http';
import { RepeatGate } from './repeat-gate';
import { remoteKind } from './request-trace';

const log = new Logger('hub.person-access');

const AUDIT_REPEAT_MS = 60_000;

const refusals = new RepeatGate(AUDIT_REPEAT_MS);

const UNREADABLE_REPEAT_MS = 3_600_000;

const unreadable = new RepeatGate(UNREADABLE_REPEAT_MS);

export interface AccessEntry {
  readonly remote: string;
  readonly forwarded: boolean;
  readonly host: string | null;
  readonly statusOnly: boolean;
}

const FORWARDING_HEADERS = [
  'cf-connecting-ip',
  'cf-ray',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-real-ip',
  'forwarded',
] as const;

function hostnameOf(host: string): string | null {
  return URL.canParse(`http://${host}`) ? new URL(`http://${host}`).hostname : null;
}

export function accessEntryOf(request: IncomingMessage, statusOnly: boolean): AccessEntry {
  return {
    remote: remoteOf(request),
    forwarded: FORWARDING_HEADERS.some((name) => request.headers[name] !== undefined),
    host: request.headers.host ?? null,
    statusOnly,
  };
}

function onHomeHost(store: Store, host: string | null): boolean {
  if (host === null) return true;
  const hostname = hostnameOf(host);
  if (hostname === null) return false;
  const publicUrl = store.settings.read().public_url;
  return publicUrl === null || hostname !== new URL(publicUrl).hostname;
}

function onHomeRoute(store: Store, entry: AccessEntry): boolean {
  const kind = remoteKind(entry.remote);
  if (kind !== 'loopback' && kind !== 'private') return false;
  return !entry.forwarded && onHomeHost(store, entry.host);
}

export interface Refusal {
  readonly kind: AccessAuditKind;
  readonly detail: string;
  readonly message: string;
}

export interface Subject {
  readonly id: string | null;
  readonly profile_id: string | null;
}

export function refusal(
  store: Pick<Store, 'accessAudit'>,
  client: Subject,
  why: Refusal,
): ApiError {
  if (refusals.pass([client.id, client.profile_id, why.kind, why.detail].join(':')) !== null) {
    store.accessAudit.record({
      profile_id: client.profile_id,
      client_id: client.id,
      kind: why.kind,
      detail: why.detail,
    });
    log.warn('access.refused', {
      clientId: client.id,
      profileId: client.profile_id,
      kind: why.kind,
    });
  }
  return new ApiError('forbidden', why.message);
}

export interface Route {
  readonly home: boolean;
  readonly statusOnly: boolean;
}

export function standingRefusal(
  store: Pick<Store, 'now' | 'settings'>,
  standing: KnownStanding,
  route: Route,
): Refusal | null {
  if (isExpired(standing, store.now().toISOString())) {
    return {
      kind: 'refused_expired',
      detail: 'the access of the person has ended',
      message: 'This access has ended; ask the owner for more time.',
    };
  }
  if (standing.role === 'owner' || route.statusOnly) return null;
  if (standing.home_only && !route.home) {
    return {
      kind: 'refused_condition',
      detail: 'the person may use the home only from the home network',
      message: 'This person can use the home only from the home network.',
    };
  }
  if (standing.schedule !== null && insideSchedule(store, standing.schedule)) {
    return {
      kind: 'refused_condition',
      detail: 'the person is outside the hours they may use the home',
      message: 'This person is paused at this hour; ask the owner.',
    };
  }
  return null;
}

function insideSchedule(store: Pick<Store, 'now' | 'settings'>, schedule: QuietHours): boolean {
  const zone = store.settings.read().time_zone;
  return insideQuiet(schedule, localClock(store.now(), zone).minuteOfDay);
}

function standingOfClient(
  store: Pick<Store, 'profiles' | 'personAccess'>,
  client: ClientRow,
): PersonStanding {
  const profileId = store.profiles.activeOf(client.id).id;
  const standing = store.personAccess.standing(profileId);
  if (!standing.known && unreadable.pass(profileId) !== null) {
    log.error('access.person_unreadable', new Error(standing.reason), {
      clientId: client.id,
      profileId,
      ceiling: client.role,
    });
  }
  return standing;
}

function withRole(client: ClientRow, ceilingRole: Role, personRole: PersonRole): ClientRow {
  const role = effectiveRoleOf(ceilingRole, personRole);
  return role === client.role ? client : { ...client, role };
}

export function effectiveClient(store: Store, client: ClientRow, entry: AccessEntry): ClientRow {
  const standing = standingOfClient(store, client);
  if (!standing.known) {
    if (client.role === 'owner') return client;
    throw refusal(store, client, {
      kind: 'refused_scope',
      detail: 'the access of the person cannot be read',
      message: 'This person’s access cannot be read; ask the owner to check it.',
    });
  }
  if (client.role === 'member' && standing.role !== 'owner') {
    const why = standingRefusal(store, standing, {
      home: onHomeRoute(store, entry),
      statusOnly: entry.statusOnly,
    });
    if (why !== null) {
      throw refusal(store, { ...client, profile_id: store.profiles.activeOf(client.id).id }, why);
    }
  }
  return withRole(client, client.role, standing.role);
}

export function effectiveRow(
  store: Pick<Store, 'profiles' | 'personAccess'>,
  client: ClientRow,
): ClientRow {
  const standing = standingOfClient(store, client);
  return standing.known ? withRole(client, client.role, standing.role) : client;
}

export function hasOwnerDevice(
  store: Pick<Store, 'clients' | 'profiles' | 'personAccess'>,
  profileId: string,
): boolean {
  return store.clients
    .list()
    .some(
      (client) => client.profile_id === profileId && effectiveRow(store, client).role === 'owner',
    );
}

export function effectiveClientById(store: Store, clientId: string): ClientRow {
  return effectiveRow(store, store.clients.byId(clientId));
}

export function assertMemberPerson(
  store: Store,
  client: Pick<ClientRow, 'id' | 'profile_id'>,
  ceiling: Role,
  profileId: string,
): void {
  const standing = store.personAccess.standing(profileId);
  if (ceiling === 'member' && (!standing.known || standing.role === 'owner')) {
    throw refusal(store, client, {
      kind: 'refused_scope',
      detail: 'a member device was pointed at an owner person',
      message: 'A member device cannot use an owner person; pick a member person.',
    });
  }
}

export function assertMayChoosePerson(store: Store, clientId: string, profileId: string): void {
  const client = store.clients.byId(clientId);
  if (client.role === 'owner') return;
  if (client.profile_id === profileId) return;
  throw refusal(store, client, {
    kind: 'refused_scope',
    detail: 'a member device tried to switch person',
    message: 'A member device keeps the person it was paired for; only an owner device switches.',
  });
}
