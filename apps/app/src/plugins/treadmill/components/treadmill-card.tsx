import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Sparkline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { frameClassOf, type WidgetFrameBox } from '../../../components/widget-board';
import { cn } from '../../../design/cn';
import {
  WIDE_VISUAL_PX,
  WideCard,
  WideFigure,
  isWideClass,
  type WideClass,
} from '../../../features/devices';
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

const TREND_HEIGHT = { m: 0, w: 28, l: 40, xl: 48 } as const;
const WAITING = 'Waiting for the treadmill…';

const BADGE_TONE: Readonly<Record<StateTone, BadgeTone>> = {
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
  neutral: 'neutral',
};

function Chip({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const state = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.state);
  return (
    <View className="shrink-0">
      <Badge label={STATE_LABEL[state]} tone={BADGE_TONE[stateTone(state)]} />
    </View>
  );
}

function Figures({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const belt = useLiveSelect(deviceId, view.frame, (frame) => frame.belt);
  const incline = view.limits.incline === null ? null : belt.inclinePercent;
  return (
    <View className="flex-row flex-wrap items-end gap-x-4 gap-y-1">
      <WideFigure value={speedText(belt.speedKmh)} unit="km/h" />
      {incline === null ? null : (
        <WideFigure value={String(incline)} unit={inclineFigureUnit(belt.inclineScale)} />
      )}
      <WideFigure value={clockText(belt.timeS)} />
    </View>
  );
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
  return points.length < 2 || cls === 'm' ? null : (
    <Sparkline points={points} colour="primary" height={TREND_HEIGHT[cls]} area />
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
      chip={<Chip deviceId={device.id} view={view} />}
      state={
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {linkLine(view.link)}
        </Text>
      }
      figures={[<Figures key="figures" deviceId={device.id} view={view} />]}
      graph={<Trend deviceId={device.id} view={view} cls={cls} />}
      actions={[<StopAction key="stop" deviceId={device.id} view={view} />]}
    />
  );
}

export function TreadmillTile({
  device,
  showRoom,
  compact,
}: {
  readonly device: Device;
  readonly showRoom: boolean;
  readonly compact: boolean;
}): ReactNode {
  const state = useTreadmillState(device.id);
  const room = useRoomName(device.id);
  const line = state.data === undefined ? WAITING : linkLine(state.data.link);
  return (
    <View className={cn('flex-1 justify-between gap-2', !compact && 'flex-row items-center')}>
      {state.data === undefined ? null : (
        <BeltVisual device={device} view={state.data} size="tile" />
      )}
      <View className="min-w-0 gap-0.5">
        <Text variant="body-strong" numberOfLines={compact ? 2 : 1}>
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
    <TreadmillTile device={device} showRoom compact />
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
    <TreadmillTile device={device} showRoom compact />
  );
}
