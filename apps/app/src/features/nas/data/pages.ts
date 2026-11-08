import {
  keepPreviousData,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { useScreenInfiniteQuery } from '../../../queries/use-screen-query';

export interface CursorPage {
  readonly next: string | null;
}

export interface PagesOptions<P extends CursorPage> {
  readonly queryKey: readonly unknown[];
  readonly read: (cursor: string | null) => Promise<P>;
  readonly enabled?: boolean;
}

export type DrivePages<P extends CursorPage> = UseInfiniteQueryResult<
  InfiniteData<P, string | null>
>;

export function useDrivePages<P extends CursorPage>(options: PagesOptions<P>): DrivePages<P> {
  return useScreenInfiniteQuery<
    P,
    Error,
    InfiniteData<P, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: options.queryKey,
    queryFn: ({ pageParam }) => options.read(pageParam),
    initialPageParam: null,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function flattenPages<P extends CursorPage, T>(
  data: InfiniteData<P, string | null> | undefined,
  pick: (page: P) => readonly T[],
): readonly T[] {
  return data === undefined ? [] : data.pages.flatMap(pick);
}
