import { CHAT_RETRYING_REASON, type ChatActivityNotice } from '@smarteverything/domain';
import type { StoredEvent } from '../store/repositories/assistant-events';

export function retryNotice(event: StoredEvent, active: boolean): ChatActivityNotice {
  return {
    type: 'chat_activity',
    chatId: event.chat_id,
    turnId: event.id,
    messageId: event.message_id,
    seq: active ? 0 : 1,
    state: active ? 'thinking' : 'idle',
    steps: [],
    draft: '',
    reasoning: '',
    tools: [],
    finish: active ? null : 'stopped',
    reason: active ? CHAT_RETRYING_REASON : null,
  };
}
