import { useEffect, useMemo } from 'react';
import { background } from '@smarteverything/logging';
import { useScreenPaused } from '../../../design/screen-pause';
import { useDayKey } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSession } from '../../../store/selectors';
import { flattenPages, useDriveChips, useDriveStats, useDriveTrash } from '../data';
import type { DriveChipOf } from '../model/drive-chip';
import { deletedByOf, type DeletedByShare } from './deleted-by';
import type { LeavingMonth } from './leaving-bars';
import {
  totalsOf,
  trashItemsOf,
  type TrashItem,
  type TrashPeople,
  type TrashTotals,
} from './trash-model';

export interface TrashView {
  readonly status: 'loading' | 'error' | 'ready';
  readonly error: unknown;
  readonly retry: () => void;
  readonly complete: boolean;
  readonly items: readonly TrashItem[];
  readonly totals: TrashTotals;
  readonly deletedBy: readonly DeletedByShare[];
  readonly months: readonly LeavingMonth[] | null;
  readonly rootLabelOf: (rootId: string) => string | null;
  readonly chipOf: DriveChipOf;
}

type TrashQuery = ReturnType<typeof useDriveTrash>;

function usePeople(): TrashPeople {
  const me = useSession().client.profile_id;
  const profiles = useProfiles();
  return useMemo(
    () => ({ me, names: new Map(profiles.map((profile) => [profile.id, profile.name])) }),
    [me, profiles],
  );
}

function useWholeList(query: TrashQuery): void {
  const paused = useScreenPaused();
  const due = !paused && query.hasNextPage && !query.isFetchingNextPage && !query.isError;
  const { fetchNextPage } = query;
  useEffect(() => {
    if (due) background(fetchNextPage({ cancelRefetch: false }), 'drive_trash.page_failed');
  }, [due, fetchNextPage]);
}

function statusOf(query: TrashQuery): TrashView['status'] {
  if (query.data !== undefined) return 'ready';
  return query.isError ? 'error' : 'loading';
}

export function useTrash(): TrashView {
  const query = useDriveTrash(null);
  useWholeList(query);
  const today = useDayKey();
  const people = usePeople();
  const chipOf = useDriveChips();
  const months = useDriveStats().data?.purges ?? null;
  const { data } = query;
  const items = useMemo(
    () =>
      trashItemsOf(
        flattenPages(data, (page) => page.items),
        today,
        people,
      ),
    [data, today, people],
  );
  const deletedBy = useMemo(() => deletedByOf(items), [items]);
  return {
    status: statusOf(query),
    error: query.error,
    retry: (): void => {
      background(query.refetch(), 'drive_trash.retry_failed');
    },
    complete: !query.hasNextPage,
    items,
    totals: totalsOf(items),
    deletedBy,
    months,
    rootLabelOf: (rootId) => chipOf(rootId).label,
    chipOf,
  };
}
