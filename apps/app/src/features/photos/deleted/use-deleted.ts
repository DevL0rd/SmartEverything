import { useEffect, useMemo } from 'react';
import { background } from '@smarteverything/logging';
import { useScreenPaused } from '../../../design/screen-pause';
import { useDayKey } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useSession } from '../../../store/selectors';
import { flattenPages } from '../../nas/data/pages';
import { usePhotoDeleted } from '../data';
import {
  deletedDaysOf,
  deletedItemsOf,
  leavingMonthsOf,
  totalsOf,
  type DeletedDay,
  type DeletedItem,
  type DeletedPeople,
  type DeletedTotals,
  type LeavingMonth,
} from './model';

export interface DeletedView {
  readonly status: 'loading' | 'error' | 'ready';
  readonly error: unknown;
  readonly retry: () => void;
  readonly complete: boolean;
  readonly items: readonly DeletedItem[];
  readonly days: readonly DeletedDay[];
  readonly totals: DeletedTotals;
  readonly months: readonly LeavingMonth[];
  readonly today: string;
}

function usePeople(): DeletedPeople {
  const me = useSession().client.profile_id;
  const profiles = useProfiles();
  return useMemo(
    () => ({ me, names: new Map(profiles.map((profile) => [profile.id, profile.name])) }),
    [me, profiles],
  );
}

type DeletedQuery = ReturnType<typeof usePhotoDeleted>;

function useWholeList(query: DeletedQuery): void {
  const paused = useScreenPaused();
  const due = !paused && query.hasNextPage && !query.isFetchingNextPage && !query.isError;
  const { fetchNextPage } = query;
  useEffect(() => {
    if (due) background(fetchNextPage({ cancelRefetch: false }), 'photos.deleted.page_failed');
  }, [due, fetchNextPage]);
}

function statusOf(query: DeletedQuery): DeletedView['status'] {
  if (query.data !== undefined) return 'ready';
  return query.isError ? 'error' : 'loading';
}

export function useDeleted(): DeletedView {
  const query = usePhotoDeleted();
  useWholeList(query);
  const today = useDayKey();
  const people = usePeople();
  const { data } = query;
  const items = useMemo(
    () =>
      deletedItemsOf(
        flattenPages(data, (page) => page.items),
        today,
        people,
      ),
    [data, today, people],
  );
  const days = useMemo(() => deletedDaysOf(items), [items]);
  const months = useMemo(() => leavingMonthsOf(items, today), [items, today]);
  return {
    status: statusOf(query),
    error: query.error,
    retry: (): void => {
      background(query.refetch(), 'photos.deleted.retry_failed');
    },
    complete: !query.hasNextPage,
    items,
    days,
    totals: totalsOf(items),
    months,
    today,
  };
}
