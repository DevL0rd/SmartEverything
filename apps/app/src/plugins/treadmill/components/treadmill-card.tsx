import type { TreadmillStateView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Sparkline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { frameClassOf, type WidgetFrameBox } from '../../../components/widget-board';
import { DeviceVisual } from '../../../features/device-visuals';
import {
  WIDE_VISUAL_PX,
  WideCard,
  WideFigure,
  isWideClass,
  type WideClass,
} from '../../../features/devices';
import { chartHeight } from '../../../features/devices/scale/card-model';
import { useControl } from '../../../store/control';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import {
  useLivePoints,
  useLiveSelect,
  useTreadmillDemand,
  useTreadmillState,
} from '../data/treadmill-data';
import { seriesOf } from '../model/speed-history';
import {
  clockText,
  controlsOf,
  linkLine,
  speedText,
  STATE_LABEL,
  stateTone,
  type StateTone,
} from '../model/treadmill-model';
import { inclineFigureUnit } from '../model/widget-model';
import { BeltVisual } from './belt-visual';

const TREND_HEIGHT = { m: 28, w: 28, l: 40, xl: 48 } as const;
const WAITING = 'Waiting for the treadmill…';

const BADGE_TONE: Readonly<Record<StateTone, BadgeTone>> = {
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
  neutral: 'neutral',
};

interface FigureProps {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}

function Chip({ deviceId, view }: FigureProps): ReactNode {
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  return (
    <View className="shrink-0">
      <Badge label={STATE_LABEL[state]} tone={BADGE_TONE[stateTone(state)]} />
    </View>
  );
}

function SpeedFigure({ deviceId, view }: FigureProps): ReactNode {
  const speed = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.speedKmh);
  return <WideFigure value={speedText(speed)} unit="km/h" />;
}

function InclineFigure({ deviceId, view }: FigureProps): ReactNode {
  const percent = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.inclinePercent);
  const scale = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.inclineScale);
  return percent === null ? null : (
    <WideFigure value={String(percent)} unit={inclineFigureUnit(scale)} />
  );
}

function TimeFigure({ deviceId, view }: FigureProps): ReactNode {
  const seconds = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.timeS);
  return <WideFigure value={clockText(seconds)} />;
}

function figuresOf(deviceId: string, view: TreadmillStateView): readonly ReactNode[] {
  return [
    <SpeedFigure key="speed" deviceId={deviceId} view={view} />,
    view.limits.incline === null ? null : (
      <InclineFigure key="incline" deviceId={deviceId} view={view} />
    ),
    <TimeFigure key="time" deviceId={deviceId} view={view} />,
  ].filter((figure) => figure !== null);
}

function Trend({
  deviceId,
  view,
  cls,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
  readonly cls: WideClass;
}): ReactNode {
  const points = seriesOf(useLivePoints(deviceId, view.recentSpeed), (point) => point.speed);
  const [, setRoom] = useState<number | null>(null);
  const height = chartHeight(TREND_HEIGHT[cls]);
  return points.length < 2 ? null : (
    <View
      className="min-h-0 flex-1 justify-end"
      onLayout={(event): void => {
        setRoom(event.nativeEvent.layout.height);
      }}
    >
      {height === null ? null : <Sparkline points={points} colour="primary" height={height} area />}
    </View>
  );
}

function StopAction({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const control = useControl(deviceId, 'belt_command');
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  if (!controlsOf(view, state).stop) {
    return null;
  }
  return (
    <Button
      label="Stop"
      icon="square"
      variant="destructive"
      onPress={() => {
        background(control.set('stop'), 'control.set_failed');
      }}
    />
  );
}

function WideTreadmill({
  device,
  view,
  cls,
}: {
  readonly device: Device;
  readonly view: TreadmillStateView;
  readonly cls: WideClass;
}): ReactNode {
  const room = useRoomName(device.id);
  return (
    <WideCard
      cls={cls}
      summary={`${device.label}${room === null ? '' : `, ${room}`}. ${linkLine(view.link)}`}
      visual={<BeltVisual device={device} view={view} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={device.label}
      titleLines={2}
      chip={<Chip deviceId={device.id} view={view} />}
      state={
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {linkLine(view.link)}
        </Text>
      }
      figures={figuresOf(device.id, view)}
      graph={<Trend deviceId={device.id} view={view} cls={cls} />}
      actions={[<StopAction key="stop" deviceId={device.id} view={view} />]}
    />
  );
}

function Waiting({ device, cls }: { readonly device: Device; readonly cls: WideClass }): ReactNode {
  return (
    <WideCard
      cls={cls}
      summary={`${device.label}. ${WAITING}`}
      visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={device.label}
      titleLines={2}
      state={
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {WAITING}
        </Text>
      }
    />
  );
}

export function TreadmillTile({
  device,
  showRoom,
}: {
  readonly device: Device;
  readonly showRoom: boolean;
}): ReactNode {
  const state = useTreadmillState(device.id);
  const room = useRoomName(device.id);
  const line = state.data === undefined ? WAITING : linkLine(state.data.link);
  return (
    <View className="flex-1 flex-row items-start gap-3">
      {state.data === undefined ? (
        <DeviceVisual device={device} size="tile" />
      ) : (
        <BeltVisual device={device} view={state.data} size="tile" />
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={2}>
          {device.label}
        </Text>
        {showRoom && room !== null ? (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {room}
          </Text>
        ) : null}
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {line}
        </Text>
      </View>
    </View>
  );
}

function Wide({ device, cls }: { readonly device: Device; readonly cls: WideClass }): ReactNode {
  const state = useTreadmillState(device.id);
  useTreadmillDemand(device.id);
  return state.data === undefined ? (
    <Waiting device={device} cls={cls} />
  ) : (
    <WideTreadmill device={device} view={state.data} cls={cls} />
  );
}

export function TreadmillCardFace({
  device,
  frame,
}: {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
  readonly size: string;
}): ReactNode {
  const cls = frameClassOf(frame);
  return isWideClass(cls) ? (
    <Wide device={device} cls={cls} />
  ) : (
    <TreadmillTile device={device} showRoom />
  );
}
