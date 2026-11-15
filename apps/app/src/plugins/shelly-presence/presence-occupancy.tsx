import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StateTimeline } from '../../components/charts';
import { Text } from '../../components/text';
import { TIMELINE_CAPTIONS_PX, useGraphRoom } from '../../features/devices';
import type { Device } from '../../store/state';
import {
  PANEL_TIMELINE_HEIGHT,
  TIMELINE_HEIGHT,
  occupancyFits,
  occupancyPx,
} from './occupancy-room';
import { useOccupancy } from './use-occupancy';

export function OccupancyGraph({
  device,
  live,
  wide,
  offline,
}: {
  readonly device: Device;
  readonly live: boolean;
  readonly wide: boolean;
  readonly offline: boolean;
}): ReactNode {
  const { segments, from, to } = useOccupancy(device, live);
  const height = wide ? PANEL_TIMELINE_HEIGHT : TIMELINE_HEIGHT;
  const empty = offline ? 'Offline' : 'Nobody in the last 24 h';
  return (
    <View className="gap-1">
      <StateTimeline
        segments={segments}
        colours={{ occupied: 'primary' }}
        label="Occupied in the last 24 hours"
        from={from}
        to={to}
        height={height}
        track="surface-2"
        empty={empty}
        {...(wide ? { captions: ['24 h', 'Now'] } : {})}
      />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        Occupied, last 24 h
      </Text>
    </View>
  );
}

export function FittedOccupancy(props: {
  readonly device: Device;
  readonly live: boolean;
  readonly wide: boolean;
  readonly offline: boolean;
}): ReactNode {
  const { room, onLayout } = useGraphRoom(occupancyPx(props.wide, TIMELINE_CAPTIONS_PX));
  return (
    <View
      onLayout={onLayout}
      className="min-h-0 flex-1 justify-end"
      aria-hidden
      pointerEvents="none"
    >
      {occupancyFits(room, props.wide, TIMELINE_CAPTIONS_PX) ? <OccupancyGraph {...props} /> : null}
    </View>
  );
}
