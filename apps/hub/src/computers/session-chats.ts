import type { ClaudeListedSession, ClaudeSession } from '@smarteverything/domain';
import type { ContinuingChat } from '../store/repositories/ai-chat-continuations';

export function withContinuingChats(
  sessions: readonly ClaudeSession[],
  chats: readonly ContinuingChat[],
): ClaudeListedSession[] {
  const chatBySession = new Map<string, string>();
  for (const chat of chats)
    if (!chatBySession.has(chat.session_id)) chatBySession.set(chat.session_id, chat.id);
  return sessions.map((session) => ({
    ...session,
    app_chat_id: chatBySession.get(session.id) ?? null,
  }));
}
