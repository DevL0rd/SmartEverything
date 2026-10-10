import type { AssistantMessageRow } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';
import { oldestOf } from './thread';

const PAGE = 50;

interface History {
  readonly rows: readonly AssistantMessageRow[];
  readonly loading: boolean;
  readonly complete: boolean;
}

export type OlderLoader = (before: string) => Promise<readonly AssistantMessageRow[]>;

const EMPTY: History = { rows: [], loading: false, complete: false };

const histories = new ValueStore<Readonly<Record<string, History>>>({});

export function useOlderMessages(key: string): History {
  return useValue(histories)[key] ?? EMPTY;
}

export function forgetOlderMessages(): void {
  histories.set({});
}

function patch(key: string, change: (history: History) => History): void {
  histories.update((all) => ({ ...all, [key]: change(all[key] ?? EMPTY) }));
}

export function mergedRows(
  live: readonly AssistantMessageRow[],
  older: readonly AssistantMessageRow[],
): readonly AssistantMessageRow[] {
  if (older.length === 0) {
    return live;
  }
  const known = new Set(live.map((row) => row.id));
  return [...live, ...older.filter((row) => !known.has(row.id))];
}

export async function loadOlderMessages(
  key: string,
  shown: readonly AssistantMessageRow[],
  load: OlderLoader,
): Promise<void> {
  const current = histories.get()[key] ?? EMPTY;
  const before = oldestOf(shown) ?? new Date().toISOString();
  if (current.loading || current.complete) {
    return;
  }
  patch(key, (history) => ({ ...history, loading: true }));
  try {
    const page = await load(before);
    patch(key, (history) => ({
      rows: [...history.rows, ...page],
      loading: false,
      complete: page.length < PAGE,
    }));
  } catch (error) {
    patch(key, (history) => ({ ...history, loading: false }));
    notify({ message: 'Older messages could not be loaded', error, tone: 'critical' });
  }
}
