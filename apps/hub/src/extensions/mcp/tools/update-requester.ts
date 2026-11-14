import { AI_CHAT_ROW, type AiChatRow } from '@smarteverything/domain';
import { REPAIR_CHAT_SOURCE } from '../../../assistant/chat-directory';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import { operate } from './acting';
import { ToolError, type ToolActor, type ToolContext } from './registry';

export const OWNER_UPDATE_TOOLS: ReadonlySet<string> = new Set([
  'update_control',
  'chat_file_send',
  'repair_claim',
]);

type Caller = Pick<ToolContext, 'actor' | 'caller' | 'store'>;

export interface UpdateRequester {
  readonly profileId: string;
  readonly chatId: string | null;
}

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

function plainOwner(actor: ToolActor): boolean {
  const authority = actor.authority;
  return (
    actor.role === 'owner' &&
    actor.pluginId === undefined &&
    actor.pluginRequester === undefined &&
    (authority === undefined ||
      (authority.role === 'owner' && authority.plugin_id === null && authority.requester === null))
  );
}

function ownerConnection(context: Caller): string | null {
  const { actor, caller, store } = context;
  if (caller === null || caller.via === 'plugin') return null;
  if (actor !== null && !plainOwner(actor)) return null;
  const owners = store.personAccess.ownerIds();
  if (owners.length === 0) return null;
  const profileId = actor?.profileId ?? store.personAccess.homeOwner();
  return owners.includes(profileId) ? profileId : null;
}

export function ownerUpdateRequester(context: Caller): UpdateRequester | null {
  const chatId = ownerUpdateChat(context);
  if (chatId !== null) return { profileId: context.store.aiChats.chat(chatId).profile_id, chatId };
  const profileId = ownerConnection(context);
  return profileId === null ? null : { profileId, chatId: null };
}

export function requireUpdateRequester(context: Caller): UpdateRequester {
  const requester = ownerUpdateRequester(context);
  if (requester === null)
    throw new ToolError(
      'Only the owner’s own AI chat or an owner MCP connection can use the update tools.',
      'forbidden',
    );
  return requester;
}

export async function requesterChat(context: ToolContext): Promise<AiChatRow> {
  const { chatId } = requireUpdateRequester(context);
  if (chatId !== null) return context.store.aiChats.chat(chatId);
  const conversation = AI_CHAT_ROW.parse(await operate(context, 'openConversationChat', {}));
  return context.store.aiChats.chat(conversation.id);
}
