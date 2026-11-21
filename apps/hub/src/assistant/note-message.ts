import type { AiChatRow, MessageOrigin } from '@smarteverything/domain';
import type { NewAssistantMessage } from '../store/repositories/assistant-chat';

export function noteMessage(
  chat: AiChatRow,
  author: string,
  text: string,
  origin: MessageOrigin | null,
): NewAssistantMessage {
  return {
    embeds: [],
    cost_micros: 0,
    model: null,
    quote: null,
    profile_id: chat.profile_id,
    client_id: null,
    chat_id: chat.id,
    role: 'system',
    kind: 'update',
    author: author.slice(0, 120),
    text,
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    origin,
  };
}
