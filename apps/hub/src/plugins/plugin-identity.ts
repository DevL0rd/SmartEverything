import {
  pluginChatKey,
  type ApiError,
  type PluginPerson,
  type PluginRequester,
} from '@smarteverything/domain';
import { ownerProfileOf } from '../transcripts/owner';
import { refusal, standingRefusal, type Refusal } from '../server/person-access';
import type { Store } from '../store/store';

export interface PluginIdentity {
  readonly requester: PluginRequester;
  readonly profileId: string;
  readonly guest: string | null;
  readonly refusal: Refusal | null;
}

export type PluginIdentityStore = Pick<
  Store,
  'pluginPeople' | 'personAccess' | 'now' | 'settings' | 'accessAudit'
>;

const UNKNOWN_SENDER = 'unknown';

const CHAT_ROUTE = { home: false, statusOnly: false } as const;

function strangerOf(
  store: PluginIdentityStore,
  externalId: string | null | undefined,
): PluginIdentity {
  return {
    requester: 'unlisted',
    profileId: ownerProfileOf(store),
    guest: externalId ?? UNKNOWN_SENDER,
    refusal: null,
  };
}

function personOf(
  store: PluginIdentityStore,
  pluginId: string,
  externalId: string | null | undefined,
): PluginPerson | undefined {
  return externalId === null || externalId === undefined
    ? undefined
    : store.pluginPeople.find(pluginId, externalId);
}

function linkedIdentity(
  store: PluginIdentityStore,
  person: PluginPerson | undefined,
): PluginIdentity | null {
  if (person?.profile_id === undefined || person.profile_id === null) return null;
  const standing = store.personAccess.standing(person.profile_id);
  if (!standing.known) return null;
  const why = standingRefusal(store, standing, CHAT_ROUTE);
  const requester = person.status === 'owner' && standing.role === 'owner' ? 'owner' : 'approved';
  return {
    requester: why === null ? requester : 'unlisted',
    profileId: person.profile_id,
    guest: null,
    refusal: why,
  };
}

export function pluginIdentityOf(
  store: PluginIdentityStore,
  pluginId: string,
  externalId: string | null | undefined,
): PluginIdentity {
  return (
    linkedIdentity(store, personOf(store, pluginId, externalId)) ?? strangerOf(store, externalId)
  );
}

export function refusedAs(store: PluginIdentityStore, identity: PluginIdentity): ApiError | null {
  return identity.refusal === null
    ? null
    : refusal(store, { id: null, profile_id: identity.profileId }, identity.refusal);
}

export function admittedIdentityOf(
  store: PluginIdentityStore,
  pluginId: string,
  externalId: string | null | undefined,
): PluginIdentity {
  const identity = pluginIdentityOf(store, pluginId, externalId);
  const refused = refusedAs(store, identity);
  if (refused !== null) throw refused;
  return identity;
}

export function identityChatKey(
  guest: string | null,
  pluginId: string,
  conversationKey: string,
): string {
  return pluginChatKey(
    pluginId,
    guest === null ? conversationKey : `${conversationKey}:guest:${guest}`,
  );
}
