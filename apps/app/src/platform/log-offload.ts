import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOG_RECORD, type RuntimeLogRecord } from '@smarteverything/domain';
import { z } from 'zod';
import { jsonText } from '../format/json-text';

const OUTBOX_KEY = 'smarteverything.runtime-log-outbox';

function keyOf(scope: string): string {
  return `${OUTBOX_KEY}:${encodeURIComponent(scope)}`;
}

const GAP = z.strictObject({ count: z.int().positive(), from: LOG_RECORD.shape.timestamp });

const SNAPSHOT = z.strictObject({ records: z.array(LOG_RECORD), gap: GAP.nullable() });

export type LogGap = z.output<typeof GAP>;

interface OutboxSnapshot {
  readonly records: readonly RuntimeLogRecord[];
  readonly gap: LogGap | null;
}

export function combineGaps(left: LogGap | null, right: LogGap | null): LogGap | null {
  if (left === null) return right;
  if (right === null) return left;
  return { count: left.count + right.count, from: left.from < right.from ? left.from : right.from };
}

class UnreadableOutboxError extends Error {
  override readonly name = 'UnreadableOutboxError';

  constructor() {
    super('The saved runtime log outbox is not valid.');
  }
}

export async function readLogOutbox(scope: string): Promise<OutboxSnapshot> {
  const text = await AsyncStorage.getItem(keyOf(scope));
  if (text === null) return { records: [], gap: null };
  const read = jsonText(text);
  if (!read.ok) throw new UnreadableOutboxError();
  const parsed = SNAPSHOT.safeParse(read.value);
  if (!parsed.success) throw new UnreadableOutboxError();
  return parsed.data;
}

export function writeLogOutbox(scope: string, snapshot: OutboxSnapshot): Promise<void> {
  return AsyncStorage.setItem(keyOf(scope), JSON.stringify(snapshot));
}
