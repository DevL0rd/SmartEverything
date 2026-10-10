import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventRow } from '@smarteverything/domain';
import { RUN_PAGE, listAutomationRunEvents } from '../../../api/automations';
import { AUTOMATION_RUNS_KEY } from '../../../queries/keys';
import { useRows } from '../../../store/selectors';

const FIRST_PAGE: string | null = null;

export interface RunEvents {
  readonly events: readonly EventRow[];
  readonly loading: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly loadingMore: boolean;
  readonly retry: () => void;
}

function merged(live: readonly EventRow[], pages: readonly EventRow[][]): EventRow[] {
  const byId = new Map<string, EventRow>();
  for (const event of [...pages.flat(), ...live.filter((row) => row.kind === 'automation_run')]) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort((left, right) =>
    right.occurred_at.localeCompare(left.occurred_at),
  );
}

export function useRunEvents(): RunEvents {
  const live = useRows('events');
  const query = useInfiniteQuery({
    queryKey: AUTOMATION_RUNS_KEY,
    initialPageParam: FIRST_PAGE,
    queryFn: ({ pageParam }) => listAutomationRunEvents(pageParam),
    getNextPageParam: (last) =>
      last.length < RUN_PAGE ? undefined : (last.at(-1)?.occurred_at ?? undefined),
  });
  return {
    events: merged(live, query.data?.pages ?? []),
    loading: query.isPending,
    error: query.error,
    more: query.hasNextPage
      ? (): void => {
          void query.fetchNextPage();
        }
      : null,
    loadingMore: query.isFetchingNextPage,
    retry: (): void => {
      void query.refetch();
    },
  };
}
