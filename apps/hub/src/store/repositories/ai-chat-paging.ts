import type { AiChatRow } from '@smarteverything/domain';
import { flag } from '../sql';

export const CHAT_MOMENT_SQL = 'coalesce(ai_chats.last_message_at, ai_chats.created_at)';

export const AFTER_CHAT_SQL = `($afterId is null or pinned < $afterPinned
  or (pinned = $afterPinned and (${CHAT_MOMENT_SQL} < $afterAt
      or (${CHAT_MOMENT_SQL} = $afterAt and id > $afterId))))`;

const NO_LIMIT = -1;

export function pageParams(
  after: AiChatRow | undefined,
  limit: number | undefined,
): Record<string, string | number | null> {
  return {
    afterId: after?.id ?? null,
    afterPinned: flag(after?.pinned ?? false),
    afterAt: after === undefined ? null : (after.last_message_at ?? after.created_at),
    limit: limit ?? NO_LIMIT,
  };
}
