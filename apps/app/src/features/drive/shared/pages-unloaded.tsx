import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';

const SKELETON_ROWS = ['a', 'b', 'c', 'd'] as const;

export interface UnloadedPages {
  readonly isError: boolean;
  readonly error: Error | null;
  readonly refetch: () => Promise<unknown>;
}

export function PagesUnloaded({
  pages,
  label,
}: {
  readonly pages: UnloadedPages;
  readonly label: string;
}): ReactNode {
  if (pages.isError) {
    return (
      <ErrorState
        page
        error={pages.error}
        retry={() => {
          background(pages.refetch(), `drive.${label}.retry_failed`);
        }}
      />
    );
  }
  return (
    <View aria-busy accessibilityLabel="Loading" className="gap-3">
      <Skeleton shape="line" className="h-10 w-48" />
      {SKELETON_ROWS.map((key) => (
        <Skeleton key={key} shape="block" className="h-row-h-2" />
      ))}
    </View>
  );
}
