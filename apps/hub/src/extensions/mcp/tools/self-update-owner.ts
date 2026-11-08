import { REPAIR_CHAT_SOURCE } from '../../../assistant/chat-directory';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import { ToolError, type ToolActor, type ToolContext } from './registry';

export const OWNER_CHAT_UPDATE_TOOL = 'self_update';

type Caller = Pick<ToolContext, 'actor' | 'caller' | 'store'>;

function directOwner(actor: ToolActor): boolean {
  const authority = actor.authority;
  return (
    actor.role === 'owner' &&
    authority?.kind === 'client' &&
    authority.role === 'owner' &&
    authority.profile_id === actor.profileId &&
    authority.client_id !== null &&
    authority.client_id === actor.clientId &&
    authority.plugin_id === null &&
    authority.requester === null
  );
}

function retainedRepair(
  authority: ConversationAuthority | undefined,
  profileId: string,
  origin: string,
): boolean {
  return (
    authority?.repair_origin === origin &&
    authority.kind === 'service' &&
    authority.role === 'owner' &&
    authority.profile_id === profileId &&
    authority.plugin_id === null &&
    authority.requester === null &&
    authority.client_id === null
  );
}

function repairEventChat(
  store: Caller['store'],
  eventId: string,
  chatId: string,
  profileId: string,
): boolean {
  const event = store.assistantEvents.find(eventId);
  return event?.chat_id === chatId && event.profile_id === profileId;
}

function repairActor(actor: ToolActor, authority: ConversationAuthority, origin: string): boolean {
  return (
    actor.role === 'owner' &&
    actor.clientId === null &&
    retainedRepair(authority, actor.profileId, origin)
  );
}

function repairChat(context: Caller, actor: ToolActor, eventId: string, originId: string): boolean {
  const { store } = context;
  const canonical = store.aiChats.bySource(actor.profileId, REPAIR_CHAT_SOURCE);
  if (canonical === undefined) return false;
  return (
    canonical.id === actor.chatId &&
    store.personAccess.ownerIds().includes(actor.profileId) &&
    repairEventChat(store, eventId, canonical.id, actor.profileId) &&
    repairEventChat(store, originId, canonical.id, actor.profileId)
  );
}

function ownerRepair(context: Caller, actor: ToolActor): boolean {
  const authority = actor.authority;
  const originId = authority?.repair_origin;
  if (authority === undefined || originId === undefined) return false;
  if (!repairActor(actor, authority, originId)) return false;
  const { store } = context;
  const retained = store.harnessRecovery.authority(authority.event_id);
  const root = store.harnessRecovery.authority(originId);
  return (
    repairChat(context, actor, authority.event_id, originId) &&
    retainedRepair(retained, actor.profileId, originId) &&
    retainedRepair(root, actor.profileId, originId)
  );
}

function ownerChatActor(context: Caller, actor: ToolActor): boolean {
  return (
    actor.pluginId === undefined &&
    actor.pluginRequester === undefined &&
    (directOwner(actor) || ownerRepair(context, actor))
  );
}

export function ownerUpdateChat(context: Caller): string | null {
  const actor = context.actor;
  if (context.caller !== null || actor === null) return null;
  const { chatId } = actor;
  if (chatId === null || !ownerChatActor(context, actor)) return null;
  const chat = context.store.aiChats.find(chatId);
  return chat?.profile_id === actor.profileId && chat.kind === 'chat' ? chat.id : null;
}

export function requireUpdateChat(context: Caller): string {
  const chatId = ownerUpdateChat(context);
  if (chatId === null)
    throw new ToolError('Only the owner’s own AI chat can use self_update.', 'forbidden');
  return chatId;
}
