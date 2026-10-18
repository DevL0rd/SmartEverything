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
  children,
}: {
  readonly query: LoadableQuery<Data>;
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
    return <Skeleton shape="line" className="h-12" />;
  }
  return children(query.data);
}
