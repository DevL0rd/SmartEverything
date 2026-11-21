import { ApiError, type ClientRow } from '@smarteverything/domain';
import { effectiveClientById, effectiveRow } from '../server/person-access-units';
import { CONVERSATION_AUTHORITY } from '../harness/authority-contract';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { HostStore } from '../store/host/host-store';
import type { StoredEvent } from '../store/repositories/assistant-events';
import { storeUnit } from '../store/host/unit';
import { effectiveTools } from './tool-scope';
import {
  admitExecutionTool,
  executionRole,
  inheritedOrigin,
  intersectTools,
  type AuthorityScope,
} from './turn-authority';

type Origin = Pick<ConversationAuthority, 'plugin_id' | 'requester' | 'repair_origin'>;
type Role = 'owner' | 'member';

export function issueEventAuthority(
  store: HostStore,
  event: StoredEvent,
  scope: AuthorityScope,
): ConversationAuthority {
  const retained = store.harnessRecovery.authority(event.id);
  if (retained !== undefined) return retained;
  const authority = freshEventAuthority(store, event, scope);
  store.harnessRecovery.authorize(authority);
  return authority;
}

function freshEventAuthority(
  store: HostStore,
  event: StoredEvent,
  scope: AuthorityScope,
): ConversationAuthority {
  const { sources } = scope;
  if (sources.some((parent) => parent.profile_id !== event.profile_id))
    throw new ApiError('forbidden', 'Delegated event cannot change its initiating profile.');
  const chat = store.aiChats.chat(event.chat_id);
  const principal = initiatingPrincipal(store, event, sources);
  const origin = originOf(store, event, sources);
  const hubSource =
    event.message_id !== null &&
    store.assistantChat.message(event.message_id).origin?.source === 'hub';
  return CONVERSATION_AUTHORITY.parse({
    event_id: event.id,
    profile_id: event.profile_id,
    client_id: principal.client_id,
    kind: principal.kind,
    role: issuedRole(store, { principal, sources, profileId: event.profile_id, origin }),
    hub_os_ban:
      hubSource || scope.providerBan || chat.engine.kind === 'dsh' || sources.some(banned),
    tools: intersectTools([effectiveTools(store, chat), ...sources.map((parent) => parent.tools)]),
    ...origin,
    ...(scope.repairOrigin === null ? {} : { repair_origin: scope.repairOrigin }),
  });
}

function banned(authority: ConversationAuthority): boolean {
  return authority.hub_os_ban;
}

function originOf(
  store: HostStore,
  event: StoredEvent,
  sources: readonly ConversationAuthority[],
): Origin {
  const message = event.message_id === null ? null : store.assistantChat.message(event.message_id);
  return inheritedOrigin([
    ...sources,
    {
      plugin_id: message?.origin?.plugin_id ?? null,
      requester: message?.origin?.requester ?? null,
    },
  ]);
}

function initiatingPrincipal(
  store: HostStore,
  event: StoredEvent,
  sources: readonly ConversationAuthority[],
): Pick<ConversationAuthority, 'client_id' | 'kind'> {
  if (sources.some((parent) => parent.kind === 'service'))
    return { client_id: null, kind: 'service' };
  const ids = [...new Set([event.client_id, ...sources.map((parent) => parent.client_id)])].filter(
    (id): id is string => id !== null,
  );
  const member =
    ids.find((id) => effectiveClientById(store, id).role === 'member') ??
    sources.find((parent) => parent.role === 'member')?.client_id;
  const client = member ?? ids[0] ?? null;
  return { client_id: client, kind: client === null ? 'service' : 'client' };
}

function issuedRole(
  store: HostStore,
  issue: {
    readonly principal: Pick<ConversationAuthority, 'client_id' | 'kind'>;
    readonly sources: readonly ConversationAuthority[];
    readonly profileId: string;
    readonly origin: Origin;
  },
): Role {
  const { principal, sources, profileId, origin } = issue;
  if (sources.some((parent) => executionRole(parent) === 'member')) return 'member';
  if (principal.client_id !== null)
    return effectiveClientById(store, principal.client_id).role === 'owner' ? 'owner' : 'member';
  const ownRequest =
    origin.requester === 'owner' || (origin.plugin_id === null && origin.requester === null);
  const ownsProfile = store.clients
    .list()
    .some(
      (client) => client.profile_id === profileId && effectiveRow(store, client).role === 'owner',
    );
  return ownRequest && ownsProfile ? 'owner' : 'member';
}

export const EVENT_AUTHORITY_UNIT = storeUnit(
  (store, input: { readonly event: StoredEvent; readonly scope: AuthorityScope }) =>
    issueEventAuthority(store, input.event, input.scope),
);

export const EXECUTION_TOOL_UNIT = storeUnit(
  (store, input: { readonly name: string; readonly authority: ConversationAuthority }): void => {
    admitExecutionTool(store, input.name, input.authority);
  },
);

export interface EventAuthorityView {
  readonly authority: ConversationAuthority;
  readonly clientRole: ClientRow['role'] | null;
}

export const EVENT_AUTHORITY_VIEW_UNIT = storeUnit(
  (
    store,
    input: { readonly event: StoredEvent; readonly scope: AuthorityScope },
  ): EventAuthorityView => {
    const authority =
      store.harnessRecovery.authority(input.event.id) ??
      freshEventAuthority(store, input.event, input.scope);
    return {
      authority,
      clientRole:
        authority.client_id === null ? null : effectiveClientById(store, authority.client_id).role,
    };
  },
);
