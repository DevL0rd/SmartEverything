import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { EmptyState } from '../../../../components/empty-state';
import { Icon } from '../../../../components/icon';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import type { LibraryView } from './library-rows';

const SKELETON_ROWS = 6;

function Loading({ noun }: { readonly noun: string }): ReactNode {
  return (
    <View aria-busy accessibilityLabel={`Loading ${noun}`} className="gap-3 p-4">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} shape="block" className="h-16" />
      ))}
    </View>
  );
}

function LoadFailed({
  retry,
  noun,
  single,
}: {
  readonly retry: () => void;
  readonly noun: string;
  readonly single: string;
}): ReactNode {
  return (
    <View accessibilityRole="alert" className="items-center gap-3 px-6 py-12">
      <Icon name="alert" size={24} tone="critical" />
      <Text variant="callout" align="center">
        {`Couldn’t load ${noun}. Your current ${single} still works.`}
      </Text>
      <Button label="Try again" variant="tonal" onPress={retry} />
    </View>
  );
}

export function LibraryProblem({
  view,
  retry,
  reset,
  noun = 'models',
  single = 'model',
}: {
  readonly view: Exclude<LibraryView, 'ready'>;
  readonly retry: () => void;
  readonly reset: () => void;
  readonly noun?: string;
  readonly single?: string;
}): ReactNode {
  switch (view) {
    case 'loading':
      return <Loading noun={noun} />;
    case 'error':
      return <LoadFailed retry={retry} noun={noun} single={single} />;
    case 'offline':
      return (
        <EmptyState
          icon="wifiOff"
          title="Can’t reach your Home Hub"
          body={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} load when the connection is back.`}
        />
      );
    case 'empty':
      return (
        <EmptyState
          icon="search"
          title={`No ${noun} match these filters`}
          body="Reset the filters or search for another name."
          action={<Button label="Reset filters" variant="outlined" onPress={reset} />}
        />
      );
  }
}
