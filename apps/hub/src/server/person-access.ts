import {
  ApiError,
  effectiveRoleOf,
  type AccessAuditKind,
  type ClientRow,
  type PersonRole,
  type Role,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import type { IncomingMessage } from 'node:http';
import type { Store } from '../store/store';
import type { PersonStanding } from '../store/repositories/person-access';
import { remoteOf } from './http';
import { RepeatGate } from './repeat-gate';

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

export function accessEntryOf(request: IncomingMessage, statusOnly: boolean): AccessEntry {
  return {
    remote: remoteOf(request),
    forwarded: FORWARDING_HEADERS.some((name) => request.headers[name] !== undefined),
    host: request.headers.host ?? null,
    statusOnly,
  };
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

export function refusal(store: Pick<Store, 'host'>, client: Subject, why: Refusal): ApiError {
  if (refusals.pass([client.id, client.profile_id, why.kind, why.detail].join(':')) !== null) {
    background(
      store.host.call('accessAudit', 'record', {
        profile_id: client.profile_id,
        client_id: client.id,
        kind: why.kind,
        detail: why.detail,
      }),
      'access.audit_failed',
      { clientId: client.id, kind: why.kind },
    );
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

export function readableStanding(
  client: Pick<ClientRow, 'id' | 'role'>,
  profileId: string,
  standing: PersonStanding,
): PersonStanding {
  if (!standing.known && unreadable.pass(profileId) !== null) {
    log.error('access.person_unreadable', new Error(standing.reason), {
      clientId: client.id,
      profileId,
      ceiling: client.role,
    });
  }
  return standing;
}

export function standingOfClient(store: Pick<Store, 'live'>, client: ClientRow): PersonStanding {
  const profileId = store.live.access.activeProfileOf(client.id);
  return readableStanding(client, profileId, store.live.access.standing(profileId));
}

export function withRole(client: ClientRow, ceilingRole: Role, personRole: PersonRole): ClientRow {
  const role = effectiveRoleOf(ceilingRole, personRole);
  return role === client.role ? client : { ...client, role };
}

export type Admission =
  | { readonly kind: 'admitted'; readonly client: ClientRow }
  | { readonly kind: 'refused'; readonly subject: Subject; readonly why: Refusal };

export function admitted(store: Pick<Store, 'host'>, admission: Admission): ClientRow {
  if (admission.kind === 'refused') throw refusal(store, admission.subject, admission.why);
  return admission.client;
}

export type TokenAdmission =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'known'; readonly client: ClientRow; readonly admission: Admission };

export async function effectiveClient(
  store: Pick<Store, 'host'>,
  client: ClientRow,
  entry: AccessEntry,
): Promise<ClientRow> {
  return admitted(store, await store.host.read('clientAdmission', { client, entry }));
}

export function effectiveRow(store: Pick<Store, 'live'>, client: ClientRow): ClientRow {
  const standing = standingOfClient(store, client);
  return standing.known ? withRole(client, client.role, standing.role) : client;
}

export function hasOwnerDevice(store: Pick<Store, 'live'>, profileId: string): boolean {
  return store.live.access
    .clients()
    .some(
      (client) => client.profile_id === profileId && effectiveRow(store, client).role === 'owner',
    );
}

export function effectiveClientById(store: Pick<Store, 'live'>, clientId: string): ClientRow {
  return effectiveRow(store, store.live.access.client(clientId));
}

export function effectiveRowOf(store: Pick<Store, 'host'>, client: ClientRow): Promise<ClientRow> {
  return store.host.read('effectiveRow', { client });
}

export function effectiveClientOf(
  store: Pick<Store, 'host'>,
  clientId: string,
): Promise<ClientRow> {
  return store.host.read('effectiveClientById', { clientId });
}

export function ownerDeviceOf(store: Pick<Store, 'host'>, profileId: string): Promise<boolean> {
  return store.host.read('hasOwnerDevice', { profileId });
}

export async function assertMemberPerson(
  store: Pick<Store, 'host'>,
  client: Pick<ClientRow, 'id' | 'profile_id'>,
  ceiling: Role,
  profileId: string,
): Promise<void> {
  if (ceiling !== 'member') return;
  const standing = await store.host.call('personAccess', 'standing', profileId);
  if (!standing.known || standing.role === 'owner') {
    throw refusal(store, client, {
      kind: 'refused_scope',
      detail: 'a member device was pointed at an owner person',
      message: 'A member device cannot use an owner person; pick a member person.',
    });
  }
}

export async function assertMayChoosePerson(
  store: Pick<Store, 'host'>,
  clientId: string,
  profileId: string,
): Promise<void> {
  const client = await store.host.call('clients', 'byId', clientId);
  if (client.role === 'owner') return;
  if (client.profile_id === profileId) return;
  throw refusal(store, client, {
    kind: 'refused_scope',
    detail: 'a member device tried to switch person',
    message: 'A member device keeps the person it was paired for; only an owner device switches.',
  });
}
