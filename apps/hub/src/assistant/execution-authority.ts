import { providerHubOsBan } from './engines/computer/tool-authority';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { AiChatRow } from '@smarteverything/domain';
import { CONVERSATION_AUTHORITY } from '../harness/authority-contract';
import type { ConversationAuthority } from '../harness/authority-contract';
import {
  inheritedToolScope,
  inheritedOrigin,
  validateAuthorityGraph,
} from './authority-inheritance';
const context = new AsyncLocalStorage<readonly ConversationAuthority[]>();
const localComputers = new WeakMap<Store, (id: string) => boolean>();
const nativeTargets = new WeakMap<
  Store,
  (device: string, authority: ConversationAuthority) => boolean
>();
export function bindExecutionHost(store: Store, local: (id: string) => boolean): void {
  localComputers.set(store, local);
}
export function bindNativeExecutionTarget(
  store: Store,
  admit: (device: string, authority: ConversationAuthority) => boolean,
): void {
  nativeTargets.set(store, admit);
}
export function admitNativeExecutionTarget(
  store: Store,
  device: string,
  authority: ConversationAuthority,
): void {
  validateExecutionAuthority(store, authority);
  if (nativeTargets.get(store)?.(device, authority) !== true)
    throw new ApiError(
      'forbidden',
      'The selected native device has no current authenticated execution channel.',
    );
}
export function currentExecutionAuthority(): ConversationAuthority | undefined {
  return context.getStore()?.[0];
}
export function currentExecutionAuthorities(): readonly ConversationAuthority[] {
  return context.getStore() ?? [];
}
export function withExecutionAuthorities<T>(
  authorities: readonly ConversationAuthority[],
  work: () => T,
): T {
  return context.run(authorities, work);
}
export function withExecutionAuthority<T>(authority: ConversationAuthority, work: () => T): T {
  return context.run(
    [
      ...new Map(
        [authority, ...currentExecutionAuthorities()].map(
          (source) => [source.event_id, source] as const,
        ),
      ).values(),
    ],
    work,
  );
}
export function admitExecutionTarget(
  store: Store,
  chat: AiChatRow,
  authority: ConversationAuthority,
): void {
  validateExecutionAuthority(store, authority);
  if (chat.profile_id !== authority.profile_id)
    throw new ApiError('forbidden', 'Delegated execution cannot leave its initiating profile.');
  if (chat.engine.kind === 'dsh' && chat.engine.execution_target.kind === 'device') {
    admitNativeExecutionTarget(store, chat.engine.execution_target.device_id, authority);
    return;
  }
  if (!authority.hub_os_ban && !providerHubOsBan()) return;
  const id = executionDevice(chat);
  if (id === null) return;
  const local = localComputers.get(store);
  if (local === undefined || local(id))
    throw new ApiError(
      'forbidden',
      'Hub-originated work cannot obtain hub-local OS access through another engine, relay or child.',
    );
}
export function selectedExecutionDevice(
  store: Store,
  device: string,
  authority: ConversationAuthority,
): boolean {
  if (providerHubOsBan() || executionRole(store, authority) !== 'owner') return false;
  return validateAuthorityGraph(store, authority).every((source) => {
    const event = store.assistantEvents.event(source.event_id);
    const chat = store.aiChats.chat(event.chat_id);
    if (chat.profile_id !== authority.profile_id || chat.engine.kind !== 'dsh') return false;
    const target = chat.engine.execution_target;
    return target.kind === 'device'
      ? target.device_id === device
      : localComputers.get(store)?.(device) === true;
  });
}
export function admitExecutionDevice(
  store: Store,
  device: string,
  authority: ConversationAuthority,
): void {
  validateExecutionAuthority(store, authority);
  if (
    (!authority.hub_os_ban && !providerHubOsBan()) ||
    store.devices.byId(device).kind !== 'computer'
  )
    return;
  if (!selectedExecutionDevice(store, device, authority))
    throw new ApiError(
      'forbidden',
      'Computer commands require the authorized selected execution target.',
    );
}
export function validateExecutionAuthority(store: Store, authority: ConversationAuthority): void {
  validateAuthorityGraph(store, authority);
}
export function eventAuthority(store: Store, event: StoredEvent): ConversationAuthority {
  const retained = store.harnessRecovery.authority(event.id);
  if (retained !== undefined) {
    validateExecutionAuthority(store, retained);
    return retained;
  }
  if (event.client_id === null)
    throw new ApiError(
      'forbidden',
      'This unattended event has no issued initiating-profile service grant.',
    );
  return issueEventAuthority(store, event, false);
}
export function issueEventAuthority(
  store: Store,
  event: StoredEvent,
  service: boolean,
  source?: ConversationAuthority,
): ConversationAuthority {
  const sources = [
    ...new Map(
      [source, ...currentExecutionAuthorities()]
        .filter((value): value is ConversationAuthority => value !== undefined)
        .map((parent) => [parent.event_id, parent] as const),
    ).values(),
  ];
  const principal = initiatingPrincipal(store, event, sources);
  for (const parent of sources) {
    if (parent.event_id === event.id)
      throw new ApiError('forbidden', 'Initiating authority cannot inherit itself.');
    admitInheritance(store, event, service, parent);
  }
  if (sources.length === 0) admitInheritance(store, event, service, undefined);
  const chat = store.aiChats.chat(event.chat_id);
  const authority = CONVERSATION_AUTHORITY.parse({
    event_id: event.id,
    profile_id: event.profile_id,
    client_id: principal.client_id,
    kind: principal.kind,
    role: issuedRole(store, principal, sources),
    hub_os_ban:
      providerHubOsBan() || sources.some((parent) => parent.hub_os_ban) || isDshConversation(chat),
    tools: inheritedToolScope(store, chat, sources),
    parents: [...new Set(sources.map((parent) => parent.event_id))],
    ...originAuthority(store, event, sources),
  });
  store.harnessRecovery.authorize(authority);
  validateExecutionAuthority(store, authority);
  return authority;
}
function admitInheritance(
  store: Store,
  event: StoredEvent,
  service: boolean,
  inherited: ConversationAuthority | undefined,
): void {
  if (inherited !== undefined) {
    validateExecutionAuthority(store, inherited);
    if (inherited.profile_id !== event.profile_id)
      throw new ApiError('forbidden', 'Delegated event cannot change its initiating profile.');
    return;
  }
  if (event.client_id === null && !service)
    throw new ApiError('forbidden', 'Missing genuine client or internal service authority.');
}
function originAuthority(
  store: Store,
  event: StoredEvent,
  sources: readonly ConversationAuthority[],
): Pick<ConversationAuthority, 'plugin_id' | 'requester'> {
  const origin =
    event.message_id === null ? null : store.assistantChat.message(event.message_id).origin;
  return inheritedOrigin([
    ...sources,
    { plugin_id: origin?.plugin_id ?? null, requester: origin?.requester ?? null },
  ]);
}
function executionDevice(chat: AiChatRow): string | null {
  if (chat.engine.kind === 'openrouter') return null;
  if (chat.engine.kind !== 'dsh') return chat.engine.device_id;
  return chat.engine.execution_target.kind === 'server'
    ? null
    : chat.engine.execution_target.device_id;
}
function isDshConversation(chat: AiChatRow): boolean {
  return chat.engine.kind === 'dsh';
}

export type ExecutionToolAdmission = (
  name: string,
  args: Readonly<Record<string, unknown>>,
  authority: ConversationAuthority,
) => void;
const toolAdmissions = new WeakMap<Store, ExecutionToolAdmission>();
export function bindExecutionToolAdmission(store: Store, admit: ExecutionToolAdmission): void {
  toolAdmissions.set(store, admit);
}
export function admitExecutionTool(
  store: Store,
  name: string,
  args: Readonly<Record<string, unknown>>,
  authority: ConversationAuthority,
): void {
  validateExecutionAuthority(store, authority);
  const admit = toolAdmissions.get(store);
  if (admit === undefined)
    throw new ApiError('forbidden', 'Initiating tool admission is not installed.');
  admit(name, args, authority);
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
    ids.find((id) => store.clients.byId(id).role === 'member') ??
    sources.find((parent) => parent.role === 'member')?.client_id;
  const client = member ?? ids[0] ?? null;
  return { client_id: client, kind: client === null ? 'service' : 'client' };
}
export function executionRole(store: Store, authority: ConversationAuthority): 'owner' | 'member' {
  const sources = validateAuthorityGraph(store, authority);
  return sources.every((source) => hasOwnerRole(store, source)) ? 'owner' : 'member';
}
function hasOwnerRole(store: Store, authority: ConversationAuthority): boolean {
  return (
    authority.role === 'owner' &&
    authority.kind === 'client' &&
    authority.requester !== 'unlisted' &&
    authority.client_id !== null &&
    store.clients.byId(authority.client_id).role === 'owner'
  );
}

export function principalAuthority(
  store: Store,
  sources: readonly ConversationAuthority[],
): ConversationAuthority | undefined {
  return sources.toSorted(
    (left, right) =>
      Number(executionRole(store, left) === 'owner') -
        Number(executionRole(store, right) === 'owner') ||
      Number(left.kind === 'client') - Number(right.kind === 'client'),
  )[0];
}

function issuedRole(
  store: Store,
  principal: Pick<ConversationAuthority, 'client_id' | 'kind'>,
  sources: readonly ConversationAuthority[],
): 'owner' | 'member' {
  if (sources.some((parent) => executionRole(store, parent) === 'member')) return 'member';
  return principal.client_id !== null && store.clients.byId(principal.client_id).role === 'owner'
    ? 'owner'
    : 'member';
}
