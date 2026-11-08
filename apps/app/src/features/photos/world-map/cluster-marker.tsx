import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { PlaceCluster } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { Text } from '../../../components/text';
import { clusterTarget, type ClusterMark } from './clusters';

export function ClusterMarker({
  mark,
  selected,
  onSelect,
}: {
  readonly mark: ClusterMark;
  readonly selected: boolean;
  readonly onSelect: (cluster: PlaceCluster) => void;
}): ReactNode {
  const disc = { minWidth: mark.size, height: mark.size };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={mark.description}
      accessibilityState={{ selected }}
      onPress={() => {
        onSelect(mark.cluster);
      }}
      style={clusterTarget(mark)}
      className={cn('absolute items-center justify-center', selected && 'z-10')}
    >
      <View
        style={disc}
        className={cn(
          'items-center justify-center rounded-full border border-viz-1 px-1',
          selected ? 'bg-viz-1' : 'bg-viz-1/28',
        )}
      >
        <Text
          variant="caption"
          tone={selected ? 'onPrimary' : 'default'}
          className="font-sans-semibold tabular"
        >
          {mark.label}
        </Text>
      </View>
    </Pressable>
  );
}
