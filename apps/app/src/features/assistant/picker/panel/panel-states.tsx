import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { EmptyState } from '../../../../components/empty-state';
import { Icon } from '../../../../components/icon';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import type { LibraryView } from '../library/library-rows';

const SKELETON_ROWS = 6;

function LoadingRows(): ReactNode {
  return (
    <View aria-busy accessibilityLabel="Loading models" className="gap-3 px-3 py-2">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} shape="block" className="h-11" />
      ))}
    </View>
  );
}

function Problem({ retry }: { readonly retry: () => void }): ReactNode {
  return (
    <View accessibilityRole="alert" className="items-center gap-3 px-6 py-8">
      <Icon name="alert" size={24} tone="critical" />
      <Text variant="callout" align="center">
        Couldn’t load models. Your current model still works.
      </Text>
      <Button label="Try again" variant="tonal" onPress={retry} />
    </View>
  );
}

export function PanelProblem({
  view,
  query,
  retry,
  onLibrary,
}: {
  readonly view: Exclude<LibraryView, 'ready'>;
  readonly query: string;
  readonly retry: () => void;
  readonly onLibrary: () => void;
}): ReactNode {
  switch (view) {
    case 'loading':
      return <LoadingRows />;
    case 'error':
      return <Problem retry={retry} />;
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
          title={query === '' ? 'No models available' : `No models match “${query}”`}
          body="Try another name, or look through the full library."
          action={<Button label="Search the full library" variant="outlined" onPress={onLibrary} />}
        />
      );
  }
}
