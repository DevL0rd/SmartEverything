export type MissingChatState = 'waiting' | 'checking' | 'failed' | 'archived' | 'gone';

export interface MissingChatFacts {
  readonly syncing: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly archivedIds: readonly string[];
}

export function missingChatState(chatId: string, facts: MissingChatFacts): MissingChatState {
  if (facts.syncing) return 'waiting';
  if (facts.loading) return 'checking';
  if (facts.failed) return 'failed';
  return facts.archivedIds.includes(chatId) ? 'archived' : 'gone';
}
