import type { ReactNode } from 'react';
import { ErrorState } from './error-state';
import { Skeleton } from './skeleton';

interface LoadableQuery<Data> {
  readonly isError: boolean;
  readonly error: unknown;
  readonly data: Data | undefined;
  readonly refetch: () => unknown;
}

export function LoadedQuery<Data>({
  query,
  loading,
  children,
}: {
  readonly query: LoadableQuery<Data>;
  readonly loading?: ReactNode;
  readonly children: (data: Data) => ReactNode;
}): ReactNode {
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  }
  if (query.data === undefined) {
    return loading ?? <Skeleton shape="line" className="h-12" />;
  }
  return children(query.data);
}
