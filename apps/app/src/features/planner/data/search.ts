import {
  API_ENDPOINTS as E,
  type PLANNER_SEARCH_WHEN,
  type PlannerItemRow,
  type PlannerSearchPage,
} from '@smarteverything/domain';
import {
  keepPreviousData,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { api } from '../../../api/transport';
import { PLANNER_PREFIX } from '../../../queries/keys';
import { useScreenInfiniteQuery } from '../../../queries/use-screen-query';
import { apiPerson, type PlannerPerson } from './person';

const FIRST_PAGE: string | null = null;

export type PlannerSearchWhen = (typeof PLANNER_SEARCH_WHEN)[number];

export type PlannerItemKind = PlannerItemRow['kind'];

export interface PlannerSearchFilter {
  readonly text: string;
  readonly collections: readonly string[] | null;
  readonly kinds: readonly PlannerItemKind[] | null;
  readonly when: PlannerSearchWhen;
}

export type PlannerSearchPages = UseInfiniteQueryResult<InfiniteData<PlannerSearchPage>>;

export function plannerSearchKey(
  person: PlannerPerson,
  filter: PlannerSearchFilter,
): readonly unknown[] {
  return [
    ...PLANNER_PREFIX,
    'search',
    person,
    filter.text,
    filter.collections === null ? null : [...filter.collections].sort().join(','),
    filter.kinds === null ? null : [...filter.kinds].sort().join(','),
    filter.when,
  ];
}

export async function readPlannerSearch(
  person: PlannerPerson,
  filter: PlannerSearchFilter,
  cursor: string | null,
): Promise<PlannerSearchPage> {
  const who = apiPerson(person);
  return api().call(E.readPlannerSearch, {
    query: {
      ...(who === undefined ? {} : { personId: who }),
      text: filter.text,
      when: filter.when,
      ...(filter.collections === null ? {} : { collections: [...filter.collections] }),
      ...(filter.kinds === null ? {} : { kinds: [...filter.kinds] }),
      ...(cursor === null ? {} : { cursor }),
    },
  });
}

export function usePlannerSearch(
  person: PlannerPerson,
  filter: PlannerSearchFilter,
  enabled: boolean,
): PlannerSearchPages {
  return useScreenInfiniteQuery({
    queryKey: plannerSearchKey(person, filter),
    enabled: enabled && filter.text.trim() !== '',
    initialPageParam: FIRST_PAGE,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => readPlannerSearch(person, filter, pageParam),
    getNextPageParam: (page) => page.next,
  });
}
