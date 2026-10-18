import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import type { Tone } from '../../../components/tone';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { WIDE_VISUAL_PX, WideCard, type WideClass } from '../card/wide-card';
import { LogMini } from '../log/log-mini';
import { LogTicker } from '../log/log-ticker';
import { OfflineChip, roomOnCard, StateLine, summaryOf } from './state-line';

export function VisibleRoot({
  children,
}: {
  readonly children: (live: boolean) => ReactNode;
}): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  return (
    <View ref={ref} onLayout={onLayout} className="flex-1" pointerEvents="box-none">
      {children(live)}
    </View>
  );
}

export interface SensorFrameProps {
  readonly device: Device;
  readonly cls: WideClass;
  readonly live: boolean;
  readonly line: string;
  readonly tone: Tone;
  readonly offline: boolean;
  readonly facts: readonly string[];
  readonly figures: readonly ReactNode[];
  readonly graph: ReactNode;
  readonly actions: readonly ReactNode[];
}

export function SensorFrame({
  device,
  cls,
  live,
  line,
  tone,
  offline,
  facts,
  figures,
  graph,
  actions,
}: SensorFrameProps): ReactNode {
  const room = useRoomName(device.id);
  const panel = cls === 'l' || cls === 'xl';
  return (
    <WideCard
      cls={cls}
      summary={summaryOf({ name: device.label, room, offline, facts })}
      visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={device.label}
      chip={<OfflineChip offline={offline} />}
      state={<StateLine line={line} room={roomOnCard(cls, room)} tone={tone} />}
      figures={figures}
      graph={graph}
      actions={actions}
      ticker={offline || panel ? undefined : <LogTicker deviceId={device.id} live={live} />}
      log={panel ? <LogMini deviceId={device.id} live={live} /> : undefined}
    />
  );
}
