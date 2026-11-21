import { AsyncLocalStorage } from 'node:async_hooks';
import { ApiError } from '@smarteverything/domain';
import type { AiChatRow } from '@smarteverything/domain';
import { providerHubOsBan } from './engines/computer/tool-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { Store } from '../store/store';
import type { HostStore } from '../store/host/host-store';
import type { StoredEvent } from '../store/repositories/assistant-events';
import { currentRequestSignal } from '../server/request-signal';
import { computerEngine } from './engine-kind';
import { effectiveTools } from './tool-scope';

type Origin = Pick<ConversationAuthority, 'plugin_id' | 'requester' | 'repair_origin'>;
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
  const repairRoots = new Set(sources.flatMap((source) => source.repair_origin ?? []));
  if (repairRoots.size > 1)
    throw new ApiError('forbidden', 'Queued work cannot combine different repair runs.');
  const repairRoot = [...repairRoots][0];
  return {
    plugin_id: [...plugins][0] ?? null,
    requester:
      (['unlisted', 'approved', 'owner'] as const).find((value) => requesters.includes(value)) ??
      null,
    ...(repairRoot === undefined ? {} : { repair_origin: repairRoot }),
  };
}

export function intersectTools(lists: readonly (readonly string[] | null)[]): string[] | null {
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

export interface AuthorityScope {
  readonly sources: readonly ConversationAuthority[];
  readonly providerBan: boolean;
  readonly repairOrigin: string | null;
}

export function authorityScope(
  source?: ConversationAuthority,
  repairOrigin?: string,
): AuthorityScope {
  return {
    sources: [
      ...new Map(
        [source, currentExecutionAuthority()]
          .filter((value): value is ConversationAuthority => value !== undefined)
          .map((parent) => [parent.event_id, parent] as const),
      ).values(),
    ],
    providerBan: providerHubOsBan(),
    repairOrigin: repairOrigin ?? null,
  };
}

export function withAuthoritySource(
  scope: AuthorityScope,
  source: ConversationAuthority | undefined,
): AuthorityScope {
  if (source === undefined) return scope;
  return {
    ...scope,
    sources: [
      ...new Map(
        [source, ...scope.sources].map((parent) => [parent.event_id, parent] as const),
      ).values(),
    ],
  };
}

export function eventAuthority(
  store: Pick<Store, 'host'>,
  event: StoredEvent,
  source?: ConversationAuthority,
  repairOrigin?: string,
): Promise<ConversationAuthority> {
  return store.host.write('assistantEventAuthority', {
    event,
    scope: authorityScope(source, repairOrigin),
  });
}

export function executionToolAdmitted(
  store: Pick<Store, 'host'>,
  name: string,
  authority: ConversationAuthority,
): Promise<void> {
  return store.host.read('assistantExecutionTool', { name, authority });
}

export function admitExecutionTool(
  store: HostStore,
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
  chat: Pick<AiChatRow, 'profile_id' | 'engine'>,
  authority: ConversationAuthority,
): void {
  admitExecutionOn(chat, authority, (id) => store.live.computers.isLocal(id));
}

export function admitExecutionOn(
  chat: Pick<AiChatRow, 'profile_id' | 'engine'>,
  authority: ConversationAuthority,
  isLocal: (deviceId: string) => boolean,
): void {
  if (chat.profile_id !== authority.profile_id)
    throw new ApiError('forbidden', 'Delegated execution cannot leave its initiating profile.');
  if (chat.engine.kind === 'dsh' && chat.engine.execution_target.kind === 'device') {
    requireOwnerExecution(authority);
    return;
  }
  const id = executionDeviceOf(chat);
  if (hubOriginated(authority) && id !== null && isLocal(id))
    throw new ApiError(
      'forbidden',
      'Hub-originated work cannot obtain hub-local OS access through another engine, relay or child.',
    );
}

export function executionDeviceOf(chat: Pick<AiChatRow, 'engine'>): string | null {
  const computer = computerEngine(chat.engine);
  if (computer !== null) return computer.device_id;
  if (chat.engine.kind !== 'dsh' || chat.engine.execution_target.kind === 'server') return null;
  return chat.engine.execution_target.device_id;
}

export function outputAuthority(store: Store, chatId: string): () => void {
  const signal = currentRequestSignal();
  return (): void => {
    signal?.throwIfAborted();
    store.live.chatWork.assertWorkAllowed(chatId);
  };
}
