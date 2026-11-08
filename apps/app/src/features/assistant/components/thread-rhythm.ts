import { startsMessage, type MessageItem } from '../data/thread';
import { isAssistantParticipant } from '../model/speaker';
import type { ThreadRow } from './thread-rows';

export type RowGap = 'betweenRuns' | 'insideRun' | 'ownRun' | 'betweenBlocks';

export const ROW_GAP_CLASS: Readonly<Record<RowGap, string>> = {
  betweenRuns: 'pt-4',
  insideRun: 'pt-1',
  ownRun: 'pt-0.5',
  betweenBlocks: 'pt-2',
};

function ownRow(row: ThreadRow | undefined): boolean {
  if (row === undefined) return false;
  return row.type === 'outbox' || (row.type === 'message' && row.speaker.kind === 'me');
}

function messageGap(row: MessageItem): RowGap {
  if (!startsMessage(row)) return 'betweenBlocks';
  if (row.day !== null || row.position === 'first' || row.position === 'only') {
    return 'betweenRuns';
  }
  return row.speaker.kind === 'me' ? 'ownRun' : 'insideRun';
}

export function rowGapOf(row: ThreadRow, older: ThreadRow | undefined): RowGap {
  switch (row.type) {
    case 'message':
      return messageGap(row);
    case 'outbox':
      return ownRow(older) ? 'ownRun' : 'betweenRuns';
    case 'image-operation':
      return older?.type === 'message' && isAssistantParticipant(older.row)
        ? 'betweenBlocks'
        : 'betweenRuns';
  }
}

export function entryOf(row: ThreadRow): { readonly identity: string; readonly at: string } {
  switch (row.type) {
    case 'message':
      return { identity: row.row.id, at: row.row.created_at };
    case 'outbox':
      return { identity: row.key, at: row.message.queuedAt };
    case 'image-operation':
      return { identity: row.key, at: row.receipt.created_at };
  }
}
