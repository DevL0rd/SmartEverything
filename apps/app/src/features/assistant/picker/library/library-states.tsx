import { use, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { EmptyState } from '../../../../components/empty-state';
import { Icon } from '../../../../components/icon';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import type { LibraryView } from './library-rows';
import { CatalogueFit } from './catalogue-fit';
import { cn } from '../../../../design/cn';

const SKELETON_ROWS = 6;

interface LoadingLayout {
  readonly columns: number;
  readonly rowHeight: number;
}

function LoadingCell(): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-3 px-5">
      <View className="size-8 shrink-0 rounded-md bg-surface-3" />
      <View className="min-w-0 flex-1 gap-1">
        <View className="h-3 w-3/5 max-w-52 rounded-xs bg-surface-3" />
        <View className="h-2.5 w-2/5 max-w-36 rounded-xs bg-surface-3" />
        <View className="h-2.5 w-1/3 max-w-28 rounded-xs bg-surface-3" />
      </View>
    </View>
  );
}

function LoadingGrid({
  noun,
  layout,
}: {
  readonly noun: string;
  readonly layout: LoadingLayout;
}): ReactNode {
  const style = { height: layout.rowHeight };
  return (
    <View
      aria-busy
      accessibilityLabel={`Loading ${noun}`}
      className="min-h-0 flex-1 overflow-hidden"
    >
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <View key={row} aria-hidden className="shrink-0 flex-row" style={style}>
          {Array.from({ length: layout.columns }, (_, column) => (
            <LoadingCell key={column} />
          ))}
        </View>
      ))}
    </View>
  );
}

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
  compact,
}: {
  readonly retry: () => void;
  readonly noun: string;
  readonly single: string;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View
      accessibilityRole="alert"
      className={cn('items-center gap-3 px-6', compact ? 'py-4' : 'py-12')}
    >
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
  loadingLayout,
}: {
  readonly view: Exclude<LibraryView, 'ready'>;
  readonly retry: () => void;
  readonly reset: () => void;
  readonly noun?: string;
  readonly single?: string;
  readonly loadingLayout?: LoadingLayout;
}): ReactNode {
  const compact = use(CatalogueFit) !== null;
  switch (view) {
    case 'loading':
      return loadingLayout === undefined ? (
        <Loading noun={noun} />
      ) : (
        <LoadingGrid noun={noun} layout={loadingLayout} />
      );
    case 'error':
      return <LoadFailed retry={retry} noun={noun} single={single} compact={compact} />;
    case 'offline':
      return (
        <EmptyState
          compact={compact}
          icon="wifiOff"
          title="Can’t reach your Home Hub"
          body={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} load when the connection is back.`}
        />
      );
    case 'empty':
      return (
        <EmptyState
          compact={compact}
          icon="search"
          title={`No ${noun} match these filters`}
          body="Reset the filters or search for another name."
          action={<Button label="Reset filters" variant="outlined" onPress={reset} />}
        />
      );
  }
}
