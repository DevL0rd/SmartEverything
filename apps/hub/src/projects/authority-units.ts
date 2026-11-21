import { ApiError } from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import { admitExecutionTool } from '../assistant/turn-authority';
import { storeUnit } from '../store/host/unit';

export interface ProjectAuthorityCheck {
  readonly chatId: string;
  readonly profileId: string;
  readonly write: boolean;
  readonly authority: ConversationAuthority | null;
  readonly tool: string | null;
}

export const PROJECT_AUTHORITY_UNIT = storeUnit((store, check: ProjectAuthorityCheck): null => {
  const { chatId, profileId, write, authority, tool } = check;
  const chat = store.aiChats.chat(chatId);
  if (chat.profile_id !== profileId)
    throw new ApiError('forbidden', 'The managed project belongs to a different profile.');
  store.aiChats.assertWorkAllowed(chatId, write ? 'write' : 'read');
  if (write && chat.engine.kind === 'dsh' && chat.engine.permission.sandbox === 'read-only')
    throw new ApiError(
      'forbidden',
      'The current chat permission allows reading its managed project only.',
    );
  if (authority === null) return null;
  if (
    authority.profile_id !== profileId ||
    store.assistantEvents.event(authority.event_id).chat_id !== chatId
  )
    throw new ApiError(
      'forbidden',
      'Managed project access differs from its initiating authority.',
    );
  if (tool !== null) admitExecutionTool(store, tool, authority);
  return null;
});
