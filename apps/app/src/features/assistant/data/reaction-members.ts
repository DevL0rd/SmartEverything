import type { AssistantMessageRow, AssistantReaction } from '@smarteverything/domain';

export interface ReactionReceipt {
  readonly sequence: number | null;
  readonly reactions: readonly AssistantReaction[];
}

export interface Acknowledged {
  readonly row: AssistantMessageRow;
  readonly receipt: ReactionReceipt;
  readonly revision: number;
}

export function acknowledgedReactions(
  row: AssistantMessageRow,
  acknowledgment: Acknowledged | null,
  live: AssistantMessageRow | undefined,
  liveSequence: number | null,
): readonly AssistantReaction[] {
  if (acknowledgment === null) return row.reactions ?? [];
  const { receipt } = acknowledgment;
  if (receipt.sequence !== null && liveSequence !== null && liveSequence >= receipt.sequence) {
    if (live !== undefined) return live.reactions ?? [];
    if (acknowledgment.row !== row) return row.reactions ?? [];
  }
  return receipt.reactions;
}
