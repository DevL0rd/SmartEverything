import { AI_CHAT_ROW, type AiChatRow } from '@smarteverything/domain';
import { operate } from './acting';
import { ToolError, type ToolContext } from './registry';
import type { RequesterFound, UpdateRequester } from './update-requester-units';

export type { UpdateRequester } from './update-requester-units';

export const OWNER_UPDATE_TOOLS: ReadonlySet<string> = new Set([
  'update_control',
  'chat_file_send',
  'repair_claim',
]);

type Caller = Pick<ToolContext, 'actor' | 'caller' | 'store'>;

function found(context: Caller): Promise<RequesterFound> {
  return context.store.host.read('mcpUpdateRequester', {
    actor: context.actor,
    caller: context.caller,
  });
}

export async function ownerUpdateChat(context: Caller): Promise<string | null> {
  const { requester } = await found(context);
  return requester === null ? null : requester.chatId;
}

export async function ownerUpdateRequester(context: Caller): Promise<UpdateRequester | null> {
  return (await found(context)).requester;
}

export async function requireUpdateRequester(context: Caller): Promise<UpdateRequester> {
  const requester = await ownerUpdateRequester(context);
  if (requester === null)
    throw new ToolError(
      'Only the owner’s own AI chat or an owner MCP connection can use the update tools.',
      'forbidden',
    );
  return requester;
}

export async function requireOwnerConnection(context: Caller): Promise<string> {
  const profileId = context.actor === null ? (await found(context)).connection : null;
  if (profileId === null)
    throw new ToolError(
      'Only the owner’s own MCP connection, called directly and not from an AI chat, can change the trusted release keys.',
      'forbidden',
    );
  return profileId;
}

export async function requesterChat(context: ToolContext): Promise<AiChatRow> {
  const { chatId } = await requireUpdateRequester(context);
  if (chatId !== null) return context.store.host.call('aiChats', 'chat', chatId);
  const conversation = AI_CHAT_ROW.parse(await operate(context, 'openConversationChat', {}));
  return context.store.host.call('aiChats', 'chat', conversation.id);
}
