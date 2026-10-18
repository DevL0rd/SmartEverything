import { AsyncLocalStorage } from 'node:async_hooks';
import { effectiveClientById, effectiveRow } from '../server/person-access';
import { ApiError } from '@smarteverything/domain';
import type { AiChatRow } from '@smarteverything/domain';
import { providerHubOsBan } from './engines/computer/tool-authority';
import { CONVERSATION_AUTHORITY } from '../harness/authority-contract';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { Store } from '../store/store';
import type { StoredEvent } from '../store/repositories/assistant-events';
import { currentRequestSignal } from '../server/request-signal';
import { effectiveTools } from './coordination/grants';
import { computerEngine } from './engine-kind';

type Origin = Pick<ConversationAuthority, 'plugin_id' | 'requester'>;
type Role = 'owner' | 'member';

const turn = new AsyncLocalStorage<ConversationAuthority | undefined>();

export function currentExecutionAuthority(): ConversationAuthority | undefined {
  return turn.getStore();
}

export function withExecutionAuthority<T>(
  authority: ConversationAuthority | undefined,
  work: () => T,
): T {
  return turn.run(authority, work);
}

export function hubOriginated(authority = currentExecutionAuthority()): boolean {
  return authority?.hub_os_ban === true || providerHubOsBan();
}

export function executionRole(authority: Pick<ConversationAuthority, 'role' | 'requester'>): Role {
  return authority.role === 'owner' && authority.requester !== 'unlisted' ? 'owner' : 'member';
}

export function inheritedOrigin(sources: readonly Origin[]): Origin {
  const plugins = new Set(sources.map((source) => source.plugin_id).filter((id) => id !== null));
  if (plugins.size > 1)
    throw new ApiError('forbidden', 'Queued work cannot combine ambiguous initiating plugins.');
  const requesters = sources.map((source) => source.requester);
  return {
    plugin_id: [...plugins][0] ?? null,
    requester:
      (['unlisted', 'approved', 'owner'] as const).find((value) => requesters.includes(value)) ??
      null,
  };
}

function intersectTools(lists: readonly (readonly string[] | null)[]): string[] | null {
  let tools: string[] | null = null;
  for (const list of lists) {
    if (list === null) continue;
    tools = tools === null ? [...list] : tools.filter((name) => list.includes(name));
  }
  return tools;
}

export function foldAuthorities(
  sources: readonly ConversationAuthority[],
): ConversationAuthority | undefined {
  const [first, ...rest] = sources.toSorted(
    (left, right) =>
      Number(executionRole(left) === 'owner') - Number(executionRole(right) === 'owner') ||
      Number(left.kind === 'client') - Number(right.kind === 'client'),
  );
  if (first === undefined || rest.length === 0) return first;
  return {
    ...first,
    role: sources.every((source) => executionRole(source) === 'owner') ? 'owner' : 'member',
    hub_os_ban: sources.some((source) => source.hub_os_ban),
    tools: intersectTools(sources.map((source) => source.tools)),
    ...inheritedOrigin(sources),
  };
}

export function eventAuthority(
  store: Store,
  event: StoredEvent,
  source?: ConversationAuthority,
): ConversationAuthority {
  const retained = store.harnessRecovery.authority(event.id);
  if (retained !== undefined) return retained;
  const sources = [
    ...new Map(
      [source, currentExecutionAuthority()]
        .filter((value): value is ConversationAuthority => value !== undefined)
        .map((parent) => [parent.event_id, parent] as const),
    ).values(),
  ];
  if (sources.some((parent) => parent.profile_id !== event.profile_id))
    throw new ApiError('forbidden', 'Delegated event cannot change its initiating profile.');
  const chat = store.aiChats.chat(event.chat_id);
  const principal = initiatingPrincipal(store, event, sources);
  const origin = originOf(store, event, sources);
  const authority = CONVERSATION_AUTHORITY.parse({
    event_id: event.id,
    profile_id: event.profile_id,
    client_id: principal.client_id,
    kind: principal.kind,
    role: issuedRole(store, { principal, sources, profileId: event.profile_id, origin }),
    hub_os_ban: providerHubOsBan() || chat.engine.kind === 'dsh' || sources.some(banned),
    tools: intersectTools([effectiveTools(store, chat), ...sources.map((parent) => parent.tools)]),
    ...origin,
  });
  store.harnessRecovery.authorize(authority);
  return authority;
}

function banned(authority: ConversationAuthority): boolean {
  return authority.hub_os_ban;
}

function originOf(
  store: Store,
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
  store: Store,
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
  store: Store,
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

export function admitExecutionTool(
  store: Store,
  name: string,
  authority: ConversationAuthority,
): void {
  const chat = store.aiChats.chat(store.assistantEvents.event(authority.event_id).chat_id);
  if (
    (authority.tools !== null && !authority.tools.includes(name)) ||
    effectiveTools(store, chat)?.includes(name) === false
  )
    throw new ApiError('forbidden', 'The current initiating grant does not expose this tool.');
}

export function requireOwnerExecution(authority: ConversationAuthority): void {
  if (executionRole(authority) !== 'owner')
    throw new ApiError('forbidden', 'Only the home owner can run work on a computer.');
}

export function admitExecutionTarget(
  store: Store,
  chat: AiChatRow,
  authority: ConversationAuthority,
): void {
  if (chat.profile_id !== authority.profile_id)
    throw new ApiError('forbidden', 'Delegated execution cannot leave its initiating profile.');
  if (chat.engine.kind === 'dsh' && chat.engine.execution_target.kind === 'device') {
    requireOwnerExecution(authority);
    return;
  }
  const id = executionDevice(chat);
  if (hubOriginated(authority) && id !== null && store.computerAi.isLocal(id))
    throw new ApiError(
      'forbidden',
      'Hub-originated work cannot obtain hub-local OS access through another engine, relay or child.',
    );
}

function executionDevice(chat: AiChatRow): string | null {
  const computer = computerEngine(chat.engine);
  if (computer !== null) return computer.device_id;
  if (chat.engine.kind !== 'dsh' || chat.engine.execution_target.kind === 'server') return null;
  return chat.engine.execution_target.device_id;
}

export function outputAuthority(store: Store, chatId: string): () => void {
  const signal = currentRequestSignal();
  return (): void => {
    signal?.throwIfAborted();
    store.aiChats.assertWorkAllowed(chatId);
  };
}
