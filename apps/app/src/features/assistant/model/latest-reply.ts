import type { AssistantMessageRow } from '@smarteverything/domain';

export function latestReplyText(rows: readonly AssistantMessageRow[]): string | null {
  const replies = rows.filter((row) => row.role === 'responder' && row.text.trim() !== '');
  const latest = replies.reduce<AssistantMessageRow | null>(
    (best, row) => (best === null || row.created_at > best.created_at ? row : best),
    null,
  );
  return latest?.text ?? null;
}
