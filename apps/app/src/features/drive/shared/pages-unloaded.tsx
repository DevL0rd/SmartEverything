import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';

const SHARER_GROUPS = [
  { key: 'a', rows: ['a1', 'a2', 'a3'] },
  { key: 'b', rows: ['b1', 'b2'] },
] as const;

const CARDS = ['a', 'b', 'c'] as const;

export type UnloadedShape = 'groups' | 'cards';

export interface UnloadedPages {
  readonly isError: boolean;
  readonly error: Error | null;
  readonly refetch: () => Promise<unknown>;
}

function GroupsSkeleton(): ReactNode {
  return (
    <>
      {SHARER_GROUPS.map((group) => (
        <View key={group.key} className="gap-2 pt-4">
          <View className="flex-row items-center gap-3 px-1">
            <Skeleton shape="circle" className="size-8" />
            <Skeleton shape="text" className="h-4 w-28" />
          </View>
          <View className="gap-px overflow-hidden rounded-lg">
            {group.rows.map((row) => (
              <Skeleton key={row} shape="block" className="h-row-h-2 rounded-none" />
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function CardsSkeleton(): ReactNode {
  return (
    <>
      <Skeleton shape="line" className="h-6 w-40" />
      {CARDS.map((key) => (
        <Skeleton key={key} shape="tile" className="h-40" />
      ))}
    </>
  );
}

export function PagesUnloaded({
  pages,
  label,
  shape,
}: {
  readonly pages: UnloadedPages;
  readonly label: string;
  readonly shape: UnloadedShape;
}): ReactNode {
  if (pages.isError) {
    return (
      <View className="px-gutter">
        <ErrorState
          page
          error={pages.error}
          retry={() => {
            background(pages.refetch(), `drive.${label}.retry_failed`);
          }}
        />
      </View>
    );
  }
  return (
    <View aria-busy accessibilityLabel="Loading" className="gap-3 px-gutter">
      {shape === 'groups' ? <GroupsSkeleton /> : <CardsSkeleton />}
    </View>
  );
}
