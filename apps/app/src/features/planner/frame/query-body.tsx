import { background } from '@smarteverything/logging';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';

export interface QueryBodyProps<T> {
  readonly query: UseQueryResult<T>;
  readonly children: (data: T) => ReactNode;
}

export function QueryBody<T>({ query, children }: QueryBodyProps<T>): ReactNode {
  if (query.data !== undefined) return children(query.data);
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          background(query.refetch(), 'planner.refetch_failed');
        }}
        page
      />
    );
  }
  return (
    <View className="gap-3">
      <Skeleton shape="tile" />
      <Skeleton shape="block" />
    </View>
  );
}
