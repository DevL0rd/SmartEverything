import {
  pluginChatKey,
  type ApiError,
  type PluginPerson,
  type PluginRequester,
} from '@smarteverything/domain';
import { ownerProfileOf } from '../transcripts/owner';
import { refusal, standingRefusal, type Refusal } from '../server/person-access';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';

export interface PluginIdentity {
  readonly requester: PluginRequester;
  readonly profileId: string;
  readonly guest: string | null;
  readonly refusal: Refusal | null;
}

type IdentityStore = Pick<Store, 'personAccess' | 'now' | 'settings' | 'pluginPeople'>;

export type PluginIdentityStore = Pick<Store, 'host'>;

const UNKNOWN_SENDER = 'unknown';

const CHAT_ROUTE = { home: false, statusOnly: false } as const;

function strangerOf(store: IdentityStore, externalId: string | null | undefined): PluginIdentity {
  return {
    requester: 'unlisted',
    profileId: ownerProfileOf(store),
    guest: externalId ?? UNKNOWN_SENDER,
    refusal: null,
  };
}

function personOf(
  store: IdentityStore,
  pluginId: string,
  externalId: string | null | undefined,
): PluginPerson | undefined {
  return externalId === null || externalId === undefined
    ? undefined
    : store.pluginPeople.find(pluginId, externalId);
}

function linkedIdentity(
  store: IdentityStore,
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

function identityOf(
  store: IdentityStore,
  pluginId: string,
  externalId: string | null | undefined,
): PluginIdentity {
  return (
    linkedIdentity(store, personOf(store, pluginId, externalId)) ?? strangerOf(store, externalId)
  );
}

export const PLUGIN_IDENTITY_UNIT = storeUnit(
  (
    store,
    input: { readonly pluginId: string; readonly externalId: string | null },
  ): PluginIdentity => identityOf(store, input.pluginId, input.externalId),
);

export function pluginIdentityOf(
  store: PluginIdentityStore,
  pluginId: string,
  externalId: string | null | undefined,
): Promise<PluginIdentity> {
  return store.host.read('pluginIdentity', { pluginId, externalId: externalId ?? null });
}

export function refusedAs(store: PluginIdentityStore, identity: PluginIdentity): ApiError | null {
  return identity.refusal === null
    ? null
    : refusal(store, { id: null, profile_id: identity.profileId }, identity.refusal);
}

export async function admittedIdentityOf(
  store: PluginIdentityStore,
  pluginId: string,
  externalId: string | null | undefined,
): Promise<PluginIdentity> {
  const identity = await pluginIdentityOf(store, pluginId, externalId);
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
