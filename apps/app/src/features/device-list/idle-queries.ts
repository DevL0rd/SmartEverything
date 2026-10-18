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

const IDLE: IdleQuery = {
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

export const idleQueries = {
  useScreenQuery: (): IdleQuery => IDLE,
  useScreenInfiniteQuery: (): IdleQuery => IDLE,
};
