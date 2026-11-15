import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  alarmClustersOf,
  clusterLabel,
  clusterText,
  PILL_HEIGHT,
  type AlarmCluster,
} from './alarm-clusters';
import { topStyle, yOf, type AlarmPin as Pin } from './time-grid-layout';

function PinLine({
  minute,
  hourHeight,
}: {
  readonly minute: number;
  readonly hourHeight: number;
}): ReactNode {
  return (
    <View
      pointerEvents="none"
      style={topStyle(yOf(minute, hourHeight))}
      className="absolute inset-x-0 -mt-px h-0.5 bg-primary"
    />
  );
}

function ClusterPill({
  cluster,
  hourHeight,
  compact,
}: {
  readonly cluster: AlarmCluster;
  readonly hourHeight: number;
  readonly compact: boolean;
}): ReactNode {
  const top = yOf(cluster.minute, hourHeight);
  return (
    <View pointerEvents="box-none" style={topStyle(top)} className="absolute inset-x-0 h-0">
      <View
        pointerEvents="box-none"
        className={cn(
          'absolute left-0.5 right-0.5 flex-row',
          top < PILL_HEIGHT ? 'top-1' : 'bottom-0.5',
        )}
      >
        <View className="max-w-full shrink rounded-full bg-surface-1">
          <Interactive
            href={href.clock.alarms()}
            label={clusterLabel(cluster)}
            className="flex-row items-center gap-1 rounded-full bg-primary-container py-0.5 pl-1.5 pr-2"
          >
            <Icon name="alarmClock" size={16} tone="onPrimaryContainer" />
            <Text
              variant="caption"
              tone="onPrimaryContainer"
              numberOfLines={1}
              className="tabular shrink"
            >
              {clusterText(cluster, compact)}
            </Text>
          </Interactive>
        </View>
      </View>
    </View>
  );
}

export function AlarmPins({
  pins,
  hourHeight,
  compact,
}: {
  readonly pins: readonly Pin[];
  readonly hourHeight: number;
  readonly compact: boolean;
}): ReactNode {
  const clusters = alarmClustersOf(pins, hourHeight);
  return (
    <>
      {pins.map((pin) => (
        <PinLine key={pin.key} minute={pin.minute} hourHeight={hourHeight} />
      ))}
      {clusters.map((cluster) => (
        <ClusterPill
          key={cluster.key}
          cluster={cluster}
          hourHeight={hourHeight}
          compact={compact}
        />
      ))}
    </>
  );
}
