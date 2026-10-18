import type { AssistantMessageRow, AiChatRow } from '@smarteverything/domain';
import type { HarnessService } from './service';
import { currentExecutionAuthority } from '../assistant/turn-authority';

export function legacyHistory(
  service: HarnessService,
  chat: AiChatRow,
): readonly AssistantMessageRow[] {
  if (hasNativeHistory(service, chat)) return [];
  if (service.store.harnessRecovery.forkOf(chat.id) !== undefined) return [];
  const rows = service.store.assistantChat.since(chat.id, null);
  const authority = currentExecutionAuthority();
  const event =
    authority === undefined ? undefined : service.store.assistantEvents.event(authority.event_id);
  const boundary =
    event?.chat_id === chat.id && event.answered_at === null && event.message_id !== null
      ? rows.findIndex((row) => row.id === event.message_id)
      : -1;
  return (boundary < 0 ? rows : rows.slice(0, boundary)).filter(
    (row) => row.state !== 'queued' && row.state !== 'working',
  );
}

function hasNativeHistory(service: HarnessService, chat: AiChatRow): boolean {
  if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null) return false;
  const metadata = service.store.dshSessions.stat(chat.engine.session_id, chat.profile_id);
  return metadata !== undefined && metadata.next_seq !== 0;
}
