import { vi } from 'vitest';

interface IdleQuery {
  readonly data: undefined;
  readonly dataUpdatedAt: number;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: null;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<undefined>;
  readonly refetch: () => Promise<undefined>;
}

vi.mock('../../queries/use-screen-query', () => {
  const idle: IdleQuery = {
    data: undefined,
    dataUpdatedAt: 0,
    isPending: true,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: (): Promise<undefined> => Promise.resolve(undefined),
    refetch: (): Promise<undefined> => Promise.resolve(undefined),
  };
  return {
    useScreenQuery: (): IdleQuery => idle,
    useScreenInfiniteQuery: (): IdleQuery => idle,
  };
});

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQueryClient: (): { readonly invalidateQueries: () => Promise<undefined> } => ({
    invalidateQueries: (): Promise<undefined> => Promise.resolve(undefined),
  }),
}));
