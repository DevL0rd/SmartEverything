import { RUNTIME_LOG_BATCH_MAX, type RuntimeLogRecord } from '@smarteverything/domain';

export const OFFLINE_BUFFER_BYTES = 1024 * 1024;

export const BATCH_BYTES = 256 * 1024;

export interface QueuedRecord {
  readonly record: RuntimeLogRecord;
  readonly bytes: number;
}

export function queued(record: RuntimeLogRecord): QueuedRecord {
  return { record, bytes: new TextEncoder().encode(JSON.stringify(record)).length };
}

export function sizeOf(records: readonly QueuedRecord[]): number {
  return records.reduce((total, item) => total + item.bytes, 0);
}

export function withinBuffer(
  records: readonly QueuedRecord[],
  budget = OFFLINE_BUFFER_BYTES,
): QueuedRecord[] {
  const kept: QueuedRecord[] = [];
  let carried = 0;
  for (const item of [...records].reverse()) {
    if (carried + item.bytes > budget) break;
    carried += item.bytes;
    kept.push(item);
  }
  return kept.reverse();
}

export function batchFrom(records: readonly QueuedRecord[]): readonly QueuedRecord[] {
  const taken: QueuedRecord[] = [];
  let carried = 0;
  for (const item of records) {
    if (taken.length === RUNTIME_LOG_BATCH_MAX || carried + item.bytes > BATCH_BYTES) break;
    carried += item.bytes;
    taken.push(item);
  }
  return taken;
}
