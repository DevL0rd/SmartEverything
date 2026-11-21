import type { AiChatRow } from '@smarteverything/domain';
import { executionRole } from '../assistant/turn-authority';
import type { ToolCaller } from '../ai-tools/hub-tool';
import type { MirroredSession } from './store-units';

export interface HubSession {
  readonly caller: ToolCaller;
  readonly chat: AiChatRow;
  readonly tools: readonly string[] | null;
  readonly server: boolean;
}

export function hubSession({ grant, chat, authority, tools }: MirroredSession): HubSession {
  return {
    chat,
    tools,
    server: grant.target.kind === 'server',
    caller: {
      ...(authority === undefined ? {} : { authority }),
      profileId: grant.profile_id,
      role:
        grant.role === 'owner' && (authority === undefined || executionRole(authority) === 'owner')
          ? 'owner'
          : 'member',
      chatId: chat.id,
      clientId: grant.client_id,
      via: grant.authority.kind === 'trigger' ? 'automation' : 'chat',
    },
  };
}

export interface HubSession {
  readonly caller: ToolCaller;
  readonly chat: AiChatRow;
  readonly tools: readonly string[] | null;
  readonly server: boolean;
}
