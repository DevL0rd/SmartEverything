import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { AiChatRow } from '@smarteverything/domain';
import { CONVERSATION_AUTHORITY } from '../harness/authority-contract';
import type { ConversationAuthority } from '../harness/authority-contract';
import { effectiveTools } from './coordination/grants';
export function inheritedToolScope(
  store: Store,
  chat: AiChatRow,
  sources: readonly ConversationAuthority[],
): ConversationAuthority['tools'] {
  let tools = effectiveTools(store, chat);
  for (const source of sources) {
    if (source.tools === null) continue;
    const allowed = source.tools;
    tools = tools === null ? [...source.tools] : tools.filter((name) => allowed.includes(name));
  }
  return tools === null ? null : [...tools];
}
export function inheritedOrigin(
  sources: readonly Pick<ConversationAuthority, 'plugin_id' | 'requester'>[],
): Pick<ConversationAuthority, 'plugin_id' | 'requester'> {
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
export function validateAuthorityGraph(
  store: Store,
  root: ConversationAuthority,
): readonly ConversationAuthority[] {
  const authorities: ConversationAuthority[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const stack: { readonly authority: ConversationAuthority; readonly exit: boolean }[] = [
    { authority: root, exit: false },
  ];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) throw new Error('Initiating authority traversal lost a node.');
    if (item.exit) {
      visiting.delete(item.authority.event_id);
      seen.add(item.authority.event_id);
      continue;
    }
    if (visiting.has(item.authority.event_id))
      throw new ApiError('forbidden', 'Initiating authority contains a cycle.');
    if (seen.has(item.authority.event_id)) continue;
    validateAuthority(store, item.authority);
    authorities.push(item.authority);
    visiting.add(item.authority.event_id);
    stack.push({ authority: item.authority, exit: true });
    for (const id of item.authority.parents ?? []) {
      const parent = store.harnessRecovery.authority(id);
      if (parent?.profile_id !== root.profile_id)
        throw new ApiError(
          'forbidden',
          'Inherited initiating authority is missing or changed profile.',
        );
      stack.push({ authority: parent, exit: false });
    }
  }
  return authorities;
}
function validateAuthority(store: Store, authority: ConversationAuthority): void {
  const retained = store.harnessRecovery.authority(authority.event_id);
  if (
    retained === undefined ||
    JSON.stringify(retained) !== JSON.stringify(CONVERSATION_AUTHORITY.parse(authority))
  )
    throw new ApiError('forbidden', 'This initiating event has no retained execution authority.');
  store.profiles.byId(authority.profile_id);
  if (
    authority.client_id !== null &&
    store.profiles.activeOf(store.clients.byId(authority.client_id).id).id !== authority.profile_id
  )
    throw new ApiError('forbidden', 'The initiating client changed or revoked its active profile.');
}
