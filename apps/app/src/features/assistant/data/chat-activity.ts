import type { AiChatRow } from '@smarteverything/domain';
import { useChatHarness } from './harness';
import { useChatTodos, useChatTools } from '../todo/chat-tools';
import { type BottomActivity, bottomActivityOf } from '../components/bottom-status-model';

export function useChatActivity(chat: AiChatRow): BottomActivity {
  const engine = chat.engine;
  const session = useChatHarness(chat.id, engine.kind === 'dsh' && engine.session_id !== null);
  const tools = useChatTools(chat.id);
  const todos = useChatTodos(chat.id);
  return bottomActivityOf({ chat, tools, session: session.data, todos });
}
