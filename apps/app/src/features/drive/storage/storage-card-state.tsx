import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { ErrorState } from '../../../components/error-state';
import type { IconName } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';

export interface CardQuery {
  readonly isError: boolean;
  readonly error: unknown;
  readonly refetch: () => Promise<unknown>;
}

export interface StorageCardStateProps {
  readonly title: string;
  readonly icon: IconName;
  readonly query: CardQuery;
  readonly failure: string;
}

export function StorageCardState({
  title,
  icon,
  query,
  failure,
}: StorageCardStateProps): ReactNode {
  return (
    <Card title={title} icon={icon}>
      {query.isError ? (
        <ErrorState
          error={query.error}
          retry={() => {
            background(query.refetch(), failure);
          }}
        />
      ) : (
        <Skeleton shape="tile" className="h-24" />
      )}
    </Card>
  );
}
