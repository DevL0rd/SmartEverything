import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOG_RECORD, type RuntimeLogRecord } from '@smarteverything/domain';
import { z } from 'zod';
import { jsonText } from '../format/json-text';

const OUTBOX_KEY = 'smarteverything.runtime-log-outbox';
const RECORD_MARK = ':record:';
const GAP_MARK = ':gap';

function prefixOf(scope: string): string {
  return `${OUTBOX_KEY}:${encodeURIComponent(scope)}`;
}

export function recordKeyOf(scope: string, sequence: number): string {
  return `${prefixOf(scope)}${RECORD_MARK}${String(sequence)}`;
}

const GAP = z.strictObject({ count: z.int().positive(), from: LOG_RECORD.shape.timestamp });

const LEGACY_SNAPSHOT = z.strictObject({ records: z.array(LOG_RECORD), gap: GAP.nullable() });

const SEQUENCE = z.coerce.number().int().nonnegative();

export type LogGap = z.output<typeof GAP>;

export interface StoredLogRecord {
  readonly key: string;
  readonly record: RuntimeLogRecord;
}

export interface LogOutbox {
  readonly records: readonly StoredLogRecord[];
  readonly gap: LogGap | null;
  readonly next: number;
}

export interface LogOutboxChange {
  readonly add: readonly StoredLogRecord[];
  readonly remove: readonly string[];
  readonly gap?: LogGap | null;
}

export function combineGaps(left: LogGap | null, right: LogGap | null): LogGap | null {
  if (left === null) return right;
  if (right === null) return left;
  return { count: left.count + right.count, from: left.from < right.from ? left.from : right.from };
}

class UnreadableOutboxError extends Error {
  override readonly name = 'UnreadableOutboxError';

  constructor(key: string) {
    super(`The saved runtime log outbox entry ${key} is not valid.`);
  }
}

function parsed<T>(key: string, text: string, schema: z.ZodType<T>): T {
  const read = jsonText(text);
  if (!read.ok) throw new UnreadableOutboxError(key);
  const result = schema.safeParse(read.value);
  if (!result.success) throw new UnreadableOutboxError(key);
  return result.data;
}

function sequenceOf(key: string, recordPrefix: string): number {
  const result = SEQUENCE.safeParse(key.slice(recordPrefix.length));
  if (!result.success) throw new UnreadableOutboxError(key);
  return result.data;
}

async function migrateLegacy(
  scope: string,
  legacyKey: string,
  text: string,
  interrupted: readonly string[],
): Promise<LogOutbox> {
  const legacy = parsed(legacyKey, text, LEGACY_SNAPSHOT);
  const moved = legacy.records.map((record, index) => ({ key: recordKeyOf(scope, index), record }));
  const kept = new Set(moved.map((item) => item.key));
  await writeLogOutbox(scope, {
    add: moved,
    remove: [legacyKey, ...interrupted.filter((key) => !kept.has(key))],
    gap: legacy.gap,
  });
  return { records: moved, gap: legacy.gap, next: moved.length };
}

export async function readLogOutbox(scope: string): Promise<LogOutbox> {
  const prefix = prefixOf(scope);
  const recordPrefix = `${prefix}${RECORD_MARK}`;
  const gapKey = `${prefix}${GAP_MARK}`;
  const keys = (await AsyncStorage.getAllKeys()).filter(
    (key) => key === prefix || key === gapKey || key.startsWith(recordPrefix),
  );
  if (keys.length === 0) return { records: [], gap: null, next: 0 };
  const entries = await AsyncStorage.multiGet(keys);
  const records: { readonly sequence: number; readonly stored: StoredLogRecord }[] = [];
  let gap: LogGap | null = null;
  let legacy: string | null = null;
  for (const [key, text] of entries) {
    if (text === null) continue;
    if (key === prefix) legacy = text;
    else if (key === gapKey) gap = parsed(key, text, GAP);
    else
      records.push({
        sequence: sequenceOf(key, recordPrefix),
        stored: { key, record: parsed(key, text, LOG_RECORD) },
      });
  }
  if (legacy !== null)
    return migrateLegacy(
      scope,
      prefix,
      legacy,
      records.map((item) => item.stored.key),
    );
  records.sort((left, right) => left.sequence - right.sequence);
  const last = records.at(-1);
  return {
    records: records.map((item) => item.stored),
    gap,
    next: last === undefined ? 0 : last.sequence + 1,
  };
}

export async function writeLogOutbox(scope: string, change: LogOutboxChange): Promise<void> {
  const gapKey = `${prefixOf(scope)}${GAP_MARK}`;
  const set: [string, string][] = change.add.map(({ key, record }) => [
    key,
    JSON.stringify(record),
  ]);
  const remove = [...change.remove];
  if (change.gap === null) remove.push(gapKey);
  else if (change.gap !== undefined) set.push([gapKey, JSON.stringify(change.gap)]);
  if (set.length > 0) await AsyncStorage.multiSet(set);
  if (remove.length > 0) await AsyncStorage.multiRemove(remove);
}
