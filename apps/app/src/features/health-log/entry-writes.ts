import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { HealthEntryInput, HealthEntryRow } from '@smarteverything/domain';
import { createEntry, deleteEntry, retryEntry, updateEntry } from '../../api/nutrition';
import { notify } from '../../components/toast-store';
import { ENTRIES_PREFIX } from '../../queries/health-entries';
import { z } from 'zod';

const WINDOW_KEY = z.tuple([
  z.literal('window'),
  z.literal('health'),
  z.literal('entries'),
  z.number(),
  z.number(),
  z.string(),
]);

type Rows = HealthEntryRow[];

function covers(key: readonly unknown[], row: HealthEntryRow): boolean {
  const parsed = WINDOW_KEY.safeParse(key);
  if (!parsed.success) {
    return false;
  }
  const [, , , from, to, types] = parsed.data;
  const at = Date.parse(row.start_time);
  return at >= from && at < to && (types === '' || types.split(',').includes(row.record_type));
}

function patchWindows(
  client: QueryClient,
  change: (rows: Rows, key: readonly unknown[]) => Rows,
): () => void {
  const snapshots = client.getQueriesData<Rows>({ queryKey: ENTRIES_PREFIX });
  for (const [key, rows] of snapshots) {
    if (rows !== undefined) {
      client.setQueryData<Rows>(key, change(rows, key));
    }
  }
  return (): void => {
    for (const [key, rows] of snapshots) {
      client.setQueryData(key, rows);
    }
  };
}

function rowOf(input: HealthEntryInput, id: string, before: HealthEntryRow | null): HealthEntryRow {
  const now = new Date().toISOString();
  return {
    id,
    profile_id: before?.profile_id ?? '',
    record_type: input.type,
    start_time: input.startTime,
    end_time: input.endTime,
    zone_offset_seconds: input.zoneOffsetSeconds,
    data: input.data,
    food: input.food,
    version: (before?.version ?? 0) + 1,
    save_error: null,
    created_at: before?.created_at ?? now,
    updated_at: now,
  };
}

export interface EntryWrites {
  readonly create: (input: HealthEntryInput, done: string) => Promise<HealthEntryRow | null>;
  readonly update: (before: HealthEntryRow, input: HealthEntryInput) => Promise<boolean>;
  readonly remove: (entry: HealthEntryRow, what: string) => Promise<boolean>;
}

async function attempt<T>(
  work: () => Promise<T>,
  rollback: () => void,
  failed: string,
): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    rollback();
    notify({ message: failed, error, tone: 'critical' });
    return null;
  }
}

function inputOf(entry: HealthEntryRow): HealthEntryInput {
  return {
    type: entry.record_type,
    startTime: entry.start_time,
    endTime: entry.end_time,
    zoneOffsetSeconds: entry.zone_offset_seconds,
    data: entry.data,
    food: entry.food,
  };
}

export function useEntryWrites(): EntryWrites {
  const client = useQueryClient();
  const create = async (input: HealthEntryInput, done: string): Promise<HealthEntryRow | null> => {
    const pending = rowOf(input, `pending-${String(Date.now())}`, null);
    const rollback = patchWindows(client, (rows, key) =>
      covers(key, pending) ? [...rows, pending] : rows,
    );
    const saved = await attempt(() => createEntry(input), rollback, 'Not logged');
    if (saved !== null && done !== '') {
      notify({ message: done, tone: 'positive' });
    }
    return saved;
  };
  const update = async (before: HealthEntryRow, input: HealthEntryInput): Promise<boolean> => {
    const after = rowOf(input, before.id, before);
    const rollback = patchWindows(client, (rows, key) =>
      rows.filter((row) => row.id !== before.id).concat(covers(key, after) ? [after] : []),
    );
    return (await attempt(() => updateEntry(before.id, input), rollback, 'Not changed')) !== null;
  };
  const remove = async (entry: HealthEntryRow, what: string): Promise<boolean> => {
    const rollback = patchWindows(client, (rows) => rows.filter((row) => row.id !== entry.id));
    const removed = await attempt(async () => deleteEntry(entry.id), rollback, 'Not removed');
    if (removed !== null) {
      notify({
        message: `${what} removed`,
        action: { label: 'Undo', onPress: (): void => void create(inputOf(entry), '') },
      });
    }
    return removed !== null;
  };
  return { create, update, remove };
}

export function useRetryEntry(): (entry: HealthEntryRow) => void {
  const client = useQueryClient();
  return (entry) => {
    retryEntry(entry.id).then(
      () => {
        void client.invalidateQueries({ queryKey: ENTRIES_PREFIX });
        notify({ message: 'Your phone will try again' });
      },
      (error: unknown) => {
        notify({ message: 'Could not try again', error, tone: 'critical' });
      },
    );
  };
}

export function saveProblemOf(entry: HealthEntryRow): string | null {
  return entry.save_error === null ? null : `Not saved to Health Connect · ${entry.save_error}`;
}
