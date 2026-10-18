import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { HealthEntryInput, HealthEntryRow } from '@smarteverything/domain';
import { createEntry, deleteEntry, retryEntry, updateEntry } from '../../api/nutrition';
import { notify } from '../../components/toast-store';
import { ENTRIES_PREFIX, entryInWindow } from '../../queries/health-entries';
import { Logger, background } from '@smarteverything/logging';

const log = new Logger('app.health');

type Rows = HealthEntryRow[];
type Snapshot = ReturnType<QueryClient['getQueriesData']>;

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

function everywhere(client: QueryClient, change: (rows: Rows) => Rows): void {
  client.setQueriesData<Rows>({ queryKey: ENTRIES_PREFIX }, (rows) =>
    rows === undefined ? rows : change(rows),
  );
}

function whereItBelongs(
  client: QueryClient,
  row: HealthEntryRow,
  change: (rows: Rows) => Rows,
): void {
  client.setQueriesData<Rows>(
    { queryKey: ENTRIES_PREFIX, predicate: (query) => entryInWindow(query.queryKey, row) },
    (rows) => (rows === undefined ? rows : change(rows)),
  );
}

interface EntryMutation<Vars, Result> {
  readonly work: (vars: Vars) => Promise<Result>;
  readonly apply: (client: QueryClient, vars: Vars) => void;
  readonly failed: string;
  readonly done?: (result: Result, vars: Vars) => void;
}

export function entryMutationOptions<Vars, Result>(
  client: QueryClient,
  spec: EntryMutation<Vars, Result>,
): UseMutationOptions<Result, Error, Vars, Snapshot> {
  return {
    mutationFn: spec.work,
    onMutate: async (vars): Promise<Snapshot> => {
      await client.cancelQueries({ queryKey: ENTRIES_PREFIX });
      const before = client.getQueriesData({ queryKey: ENTRIES_PREFIX });
      spec.apply(client, vars);
      return before;
    },
    onError: (error, _vars, before): void => {
      for (const [key, rows] of before ?? []) {
        client.setQueryData(key, rows);
      }
      notify({ message: spec.failed, error, tone: 'critical' });
    },
    onSuccess: (result, vars): void => {
      spec.done?.(result, vars);
    },
    onSettled: (): void => {
      background(
        client.invalidateQueries({ queryKey: ENTRIES_PREFIX }),
        'queries.invalidate_failed',
      );
    },
  };
}

interface RemoveVars {
  readonly entry: HealthEntryRow;
  readonly what: string;
}

export function removeMutation(
  undo: (entry: HealthEntryRow) => void,
): EntryMutation<RemoveVars, string> {
  return {
    work: async ({ entry }): Promise<string> => {
      await deleteEntry(entry.id);
      return entry.id;
    },
    apply: (client, { entry }): void => {
      everywhere(client, (rows) => rows.filter((row) => row.id !== entry.id));
    },
    failed: 'Not removed',
    done: (_removed, { entry, what }): void => {
      notify({
        message: `${what} removed`,
        action: {
          label: 'Undo',
          onPress: (): void => {
            undo(entry);
          },
        },
      });
    },
  };
}

export interface EntryWrites {
  readonly busy: boolean;
  readonly create: (input: HealthEntryInput, done: string) => Promise<HealthEntryRow | null>;
  readonly update: (before: HealthEntryRow, input: HealthEntryInput) => Promise<boolean>;
  readonly remove: (entry: HealthEntryRow, what: string) => Promise<boolean>;
}

interface CreateVars {
  readonly input: HealthEntryInput;
  readonly done: string;
}

export const createMutation: EntryMutation<CreateVars, HealthEntryRow> = {
  work: ({ input }): Promise<HealthEntryRow> => createEntry(input),
  apply: (client, { input }): void => {
    const pending = rowOf(input, `pending-${String(Date.now())}`, null);
    whereItBelongs(client, pending, (rows) => [...rows, pending]);
  },
  failed: 'Not logged',
  done: (_saved, { done }): void => {
    if (done !== '') {
      notify({ message: done, tone: 'positive' });
    }
  },
};

interface UpdateVars {
  readonly before: HealthEntryRow;
  readonly input: HealthEntryInput;
}

export const updateMutation: EntryMutation<UpdateVars, HealthEntryRow> = {
  work: ({ before, input }): Promise<HealthEntryRow> => updateEntry(before.id, input),
  apply: (client, { before, input }): void => {
    const after = rowOf(input, before.id, before);
    everywhere(client, (rows) => rows.filter((row) => row.id !== before.id));
    whereItBelongs(client, after, (rows) => [...rows, after]);
  },
  failed: 'Not changed',
};

async function outcome<Result>(work: Promise<Result>, event: string): Promise<Result | null> {
  try {
    return await work;
  } catch (error) {
    log.error(event, error);
    return null;
  }
}

export function useEntryWrites(): EntryWrites {
  const client = useQueryClient();
  const create = useMutation(entryMutationOptions(client, createMutation));
  const update = useMutation(entryMutationOptions(client, updateMutation));
  const remove = useMutation(
    entryMutationOptions(
      client,
      removeMutation((entry) => {
        create.mutate({ input: inputOf(entry), done: '' });
      }),
    ),
  );
  return {
    busy: create.isPending || update.isPending || remove.isPending,
    create: (input, done) => outcome(create.mutateAsync({ input, done }), 'entry.create_failed'),
    update: async (before, input) =>
      (await outcome(update.mutateAsync({ before, input }), 'entry.update_failed')) !== null,
    remove: async (entry, what) =>
      (await outcome(remove.mutateAsync({ entry, what }), 'entry.remove_failed')) !== null,
  };
}

export function useRetryEntry(): (entry: HealthEntryRow) => void {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: (entry: HealthEntryRow) => retryEntry(entry.id),
    onSuccess: (): void => {
      notify({ message: 'Your phone will try again' });
    },
    onError: (error): void => {
      notify({ message: 'Could not try again', error, tone: 'critical' });
    },
    onSettled: (): void => {
      background(
        client.invalidateQueries({ queryKey: ENTRIES_PREFIX }),
        'queries.invalidate_failed',
      );
    },
  });
  return (entry) => {
    retry.mutate(entry);
  };
}

export function saveProblemOf(entry: HealthEntryRow): string | null {
  return entry.save_error === null ? null : `Not saved to Health Connect · ${entry.save_error}`;
}
