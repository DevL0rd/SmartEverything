import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  ICON_PILL,
  clusterLabel,
  clusterText,
  pillTopOf,
  type AlarmCluster,
} from './alarm-clusters';
import { topStyle, yOf, type AlarmPin as Pin } from './time-grid-layout';

const PILL_SLOP = 8;

const TEXT_PILL_MAX = { maxWidth: '60%' } as const;

export function PinLines({
  pins,
  hourHeight,
}: {
  readonly pins: readonly Pin[];
  readonly hourHeight: number;
}): ReactNode {
  return pins.map((pin) => (
    <View
      key={pin.key}
      aria-hidden
      pointerEvents="none"
      style={topStyle(yOf(pin.minute, hourHeight))}
      className="absolute inset-x-0 h-px bg-on-surface-variant/40"
    />
  ));
}

function ClusterPill({
  cluster,
  hourHeight,
  text,
  onWidth,
}: {
  readonly cluster: AlarmCluster;
  readonly hourHeight: number;
  readonly text: boolean;
  readonly onWidth: (key: string, width: number) => void;
}): ReactNode {
  return (
    <View
      pointerEvents="box-none"
      style={topStyle(pillTopOf(cluster, hourHeight))}
      className="absolute left-0.5 right-0.5 flex-row"
    >
      <View
        onLayout={(event) => {
          onWidth(cluster.key, event.nativeEvent.layout.width);
        }}
        {...(text ? { style: TEXT_PILL_MAX } : {})}
        className={cn('rounded-full bg-surface-1', text && 'shrink')}
      >
        <Interactive
          href={href.clock.alarms()}
          label={clusterLabel(cluster)}
          hitSlop={PILL_SLOP}
          className={cn(
            'flex-row items-center rounded-full bg-primary-container',
            text ? 'gap-1 py-0.5 pl-1.5 pr-2' : 'size-5 justify-center',
          )}
          layerClassName="rounded-full"
        >
          <Icon name="alarmClock" size={text ? 16 : 14} tone="onPrimaryContainer" />
          {text ? (
            <Text
              variant="caption"
              tone="onPrimaryContainer"
              numberOfLines={1}
              className="tabular shrink"
            >
              {clusterText(cluster, false)}
            </Text>
          ) : null}
        </Interactive>
      </View>
    </View>
  );
}

export function AlarmPills({
  clusters,
  hourHeight,
  text,
  onWidth,
}: {
  readonly clusters: readonly AlarmCluster[];
  readonly hourHeight: number;
  readonly text: boolean;
  readonly onWidth: (key: string, width: number) => void;
}): ReactNode {
  return clusters.map((cluster) => (
    <ClusterPill
      key={cluster.key}
      cluster={cluster}
      hourHeight={hourHeight}
      text={text}
      onWidth={onWidth}
    />
  ));
}

export function pillWidthOf(
  text: boolean,
  measured: ReadonlyMap<string, number>,
  key: string,
): number {
  if (!text) return ICON_PILL;
  return measured.get(key) ?? 0;
}
