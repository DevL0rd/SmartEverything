import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { EmptyState } from '../../../../components/empty-state';
import { Icon } from '../../../../components/icon';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import type { LibraryView } from './library-rows';

const SKELETON_ROWS = 6;

function Loading(): ReactNode {
  return (
    <View aria-busy accessibilityLabel="Loading models" className="gap-3 p-4">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} shape="block" className="h-16" />
      ))}
    </View>
  );
}

function LoadFailed({ retry }: { readonly retry: () => void }): ReactNode {
  return (
    <View accessibilityRole="alert" className="items-center gap-3 px-6 py-12">
      <Icon name="alert" size={24} tone="critical" />
      <Text variant="callout" align="center">
        Couldn’t load models. Your current model still works.
      </Text>
      <Button label="Try again" variant="tonal" onPress={retry} />
    </View>
  );
}

export function LibraryProblem({
  view,
  retry,
  reset,
}: {
  readonly view: Exclude<LibraryView, 'ready'>;
  readonly retry: () => void;
  readonly reset: () => void;
}): ReactNode {
  switch (view) {
    case 'loading':
      return <Loading />;
    case 'error':
      return <LoadFailed retry={retry} />;
    case 'offline':
      return (
        <EmptyState
          icon="wifiOff"
          title="Can’t reach your Home Hub"
          body="Models load when the connection is back."
        />
      );
    case 'empty':
      return (
        <EmptyState
          icon="search"
          title="No models match these filters"
          body="Reset the filters or search for another name."
          action={<Button label="Reset filters" variant="outlined" onPress={reset} />}
        />
      );
  }
}
