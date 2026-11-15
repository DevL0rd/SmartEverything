import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import { ErrorState } from '../../../components/error-state';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { useIdiom } from '../../../design/platform';

function SkeletonRow({ leading }: { readonly leading: ReactNode }): ReactNode {
  return (
    <View className="min-h-row-h-2 flex-row items-center gap-4 px-4 py-2">
      {leading}
      <View className="min-w-0 flex-1 gap-2">
        <Skeleton shape="text" className="h-3.5 w-2/5" />
        <Skeleton shape="text" className="h-3 w-3/4" />
      </View>
    </View>
  );
}

function SkeletonLeading(): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return <Skeleton shape="circle" className={pointer ? 'size-8 rounded-sm' : 'size-10'} />;
}

export function SettingsQueryState<T>({
  query,
  event,
  rows,
  failed,
  title,
}: {
  readonly query: UseQueryResult<T>;
  readonly event: string;
  readonly rows: number;
  readonly failed: string;
  readonly title?: string;
}): ReactNode {
  const heading = title === undefined ? {} : { title };
  if (!query.isError) {
    return (
      <List inset {...heading}>
        {Array.from({ length: rows }, (_, index) => (
          <SkeletonRow key={index} leading={<SkeletonLeading />} />
        ))}
      </List>
    );
  }
  return (
    <List inset {...heading}>
      <View className="px-4 py-1">
        <ErrorState
          title={failed}
          error={query.error}
          wrapDetail
          retry={() => {
            background(query.refetch(), event);
          }}
        />
      </View>
    </List>
  );
}
