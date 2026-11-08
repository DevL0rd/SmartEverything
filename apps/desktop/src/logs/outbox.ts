import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  LOG_RECORD,
  RUNTIME_LOG_BATCH_MAX,
  type DesktopServer,
  type RuntimeLogBatch,
  type RuntimeLogRecord,
} from '@smarteverything/domain';
import { z } from 'zod';

const REQUEST_BYTES = 256 * 1024;
const OUTBOX_BYTES = 4 * REQUEST_BYTES;
const BATCH_OVERHEAD_BYTES = Buffer.byteLength(
  JSON.stringify({ records: [], dropped: Number.MAX_SAFE_INTEGER }),
);

const SAVED_OUTBOX = z.strictObject({
  records: z.array(LOG_RECORD),
  dropped: z.int().nonnegative(),
});

interface PendingRecord {
  readonly record: RuntimeLogRecord;
  readonly bytes: number;
}

export interface DesktopOutbox {
  readonly entries: readonly PendingRecord[];
  readonly dropped: number;
}

export const EMPTY_OUTBOX: DesktopOutbox = { entries: [], dropped: 0 };

export function outboxPath(directory: string, server: DesktopServer): string {
  const binding = createHash('sha256')
    .update(new URL(server.url).origin)
    .update('\0')
    .update(server.token)
    .digest('hex');
  return join(directory, `desktop-logs-${binding}.json`);
}

export function entryOf(record: RuntimeLogRecord): PendingRecord {
  return { record, bytes: Buffer.byteLength(JSON.stringify(record)) + 1 };
}

export function appendOutbox(older: DesktopOutbox, incoming: DesktopOutbox): DesktopOutbox {
  const entries = [...older.entries, ...incoming.entries];
  let bytes = BATCH_OVERHEAD_BYTES;
  let start = entries.length;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined || bytes + entry.bytes > OUTBOX_BYTES) break;
    bytes += entry.bytes;
    start = index;
  }
  return { entries: entries.slice(start), dropped: older.dropped + incoming.dropped + start };
}

export function appendRecord(outbox: DesktopOutbox, record: RuntimeLogRecord): DesktopOutbox {
  const entry = entryOf(record);
  if (BATCH_OVERHEAD_BYTES + entry.bytes > REQUEST_BYTES)
    return { ...outbox, dropped: outbox.dropped + 1 };
  return appendOutbox(outbox, { entries: [entry], dropped: 0 });
}

export function nextBatch(outbox: DesktopOutbox): RuntimeLogBatch | null {
  const records: RuntimeLogRecord[] = [];
  let bytes = BATCH_OVERHEAD_BYTES;
  for (const entry of outbox.entries) {
    if (records.length === RUNTIME_LOG_BATCH_MAX || bytes + entry.bytes > REQUEST_BYTES) break;
    bytes += entry.bytes;
    records.push(entry.record);
  }
  return records.length === 0 ? null : { records, dropped: outbox.dropped };
}

export async function readOutbox(path: string): Promise<DesktopOutbox> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return EMPTY_OUTBOX;
    throw cause;
  }
  const stored = SAVED_OUTBOX.parse(JSON.parse(raw));
  return appendOutbox(EMPTY_OUTBOX, {
    entries: stored.records.map(entryOf),
    dropped: stored.dropped,
  });
}

export async function writeOutbox(path: string, state: DesktopOutbox): Promise<void> {
  const next = `${path}.next`;
  await writeFile(
    next,
    JSON.stringify({
      records: state.entries.map((entry) => entry.record),
      dropped: state.dropped,
    }),
    { mode: 0o600 },
  );
  await rename(next, path);
}
