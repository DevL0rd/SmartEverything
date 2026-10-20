import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { View } from 'react-native';
import type { Tone } from '../../../components/tone';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { WIDE_VISUAL_PX, WideCard, type WideClass, type WideFrame } from '../card/wide-card';
import { LogMini } from '../log/log-mini';
import { LogTicker } from '../log/log-ticker';
import { offlineChip, roomOnCard, StateLine, summaryOf } from './state-line';

export interface VisibleFrame {
  readonly live: boolean;
  readonly frame: WideFrame;
}

export function useVisibleFrame(): VisibleFrame {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  return { live, frame: { ref, onLayout } };
}

export interface SensorFrameProps {
  readonly device: Device;
  readonly cls: WideClass;
  readonly visible: VisibleFrame;
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
  visible,
  line,
  tone,
  offline,
  facts,
  figures,
  graph,
  actions,
}: SensorFrameProps): ReactNode {
  const { live, frame } = visible;
  const room = useRoomName(device.id);
  const panel = cls === 'l' || cls === 'xl';
  return (
    <WideCard
      cls={cls}
      frame={frame}
      summary={summaryOf({ name: device.label, room, offline, facts })}
      visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={device.label}
      chip={offlineChip(offline)}
      state={<StateLine line={line} room={roomOnCard(cls, room)} tone={tone} />}
      figures={figures}
      graph={graph}
      actions={actions}
      ticker={offline || panel ? undefined : <LogTicker deviceId={device.id} live={live} />}
      log={panel ? <LogMini deviceId={device.id} live={live} /> : undefined}
    />
  );
}
