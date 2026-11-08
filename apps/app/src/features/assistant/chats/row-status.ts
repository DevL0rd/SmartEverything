import { isWorking } from '../../../store/chat-turns';
import { memoOnInputs } from '../../../store/memo-selector';
import { useStoreSelector } from '../../../store/store-context';
import { workingTurns } from '../../../store/subscriptions';
import { useAgentActivity } from '../data/agent-runs';
import { useAiDrafts } from '../data/ai-drafts';
import type { ChatEntry, ChatLine } from './chat-entry';

export type RowLine =
  | ChatLine
  | { readonly kind: 'needs'; readonly count: number }
  | { readonly kind: 'waiting'; readonly count: number }
  | { readonly kind: 'queued'; readonly count: number };

const queuedByChat = memoOnInputs(
  (state) => [state.tables.assistant_messages],
  (state): ReadonlyMap<string, number> => {
    const counts = new Map<string, number>();
    for (const row of state.tables.assistant_messages.rows) {
      if (row.role === 'person' && row.state === 'queued') {
        counts.set(row.chat_id, (counts.get(row.chat_id) ?? 0) + 1);
      }
    }
    return counts;
  },
);

export function rowLineOf(entry: ChatEntry, waiting: number, queued: number): RowLine {
  const { line } = entry;
  if (entry.requests > 0) {
    return { kind: 'needs', count: entry.requests };
  }
  if (line.kind === 'working' || line.kind === 'failed') {
    return line;
  }
  if (waiting > 0) {
    return { kind: 'waiting', count: waiting };
  }
  return queued > 0 ? { kind: 'queued', count: queued } : line;
}

export function useRowLine(entry: ChatEntry, agent: boolean): RowLine {
  const activity = useAgentActivity(agent ? entry.parentId : null, entry.id);
  const waiting = useAiDrafts(
    (state) => state.outbox.filter((message) => message.chatId === entry.id).length,
  );
  const queued = useStoreSelector((state) => queuedByChat(state).get(entry.id) ?? 0);
  const line = rowLineOf(entry, waiting, queued);
  return activity === null || line.kind === 'needs' || line.kind === 'failed'
    ? line
    : { kind: 'working', work: { phase: 'Working', step: activity } };
}

export function useAnyChatWorking(): boolean {
  return useStoreSelector((state) => Object.values(workingTurns(state)).some(isWorking));
}
