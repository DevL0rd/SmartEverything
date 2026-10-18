import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ReasonLine } from '../../../components/reason-line';
import { Skeleton } from '../../../components/skeleton';

const SKELETON_KEYS = ['first', 'second', 'third'] as const;

export function RowsSkeleton(): ReactNode {
  return (
    <View aria-busy accessibilityLabel="Loading" className="gap-4 px-4 py-3">
      {SKELETON_KEYS.map((key) => (
        <View key={key} className="gap-2">
          <Skeleton shape="line" className="w-1/2" />
          <Skeleton shape="text" />
        </View>
      ))}
    </View>
  );
}

export function LoadFailed({
  what,
  retry,
}: {
  readonly what: string;
  readonly retry: () => void;
}): ReactNode {
  return (
    <View className="px-4">
      <ReasonLine
        icon="alert"
        tone="critical"
        text={`Couldn’t load ${what}. Check your connection and try again.`}
        action={{ label: 'Try again', onPress: retry }}
      />
    </View>
  );
}
