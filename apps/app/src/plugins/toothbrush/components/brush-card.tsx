import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
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
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useBrushDemand, useBrushState, useFrameSelect } from '../data/brush-data';
import { clockText, linkLine, subtitleOf, summaryOf } from '../model/brush-model';
import { useMinute } from '../../../store/clock';
import { BrushVisual } from './brush-visual';
import { BrushStateBadge } from './state-badge';

const WAITING = 'Waiting for the toothbrush…';

function Live({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const elapsed = useFrameSelect(deviceId, view.frame, (frame) =>
    frame.activity === 'brushing' || frame.activity === 'paused' ? frame.elapsedS : null,
  );
  const { today } = view;
  if (elapsed !== null) {
    return view.mine || view.frame.detailVisible ? (
      <WideFigure value={clockText(elapsed)} caption="Brushing" />
    ) : null;
  }
  return view.mine && today !== null ? (
    <WideFigure value={`${String(today.counted)}/${String(today.goalSessions)}`} caption="Today" />
  ) : null;
}

function Charge({ view }: { readonly view: BrushStateView }): ReactNode {
  const { battery } = view;
  if (battery.percent === null) {
    return null;
  }
  const low = battery.low && !battery.charging;
  return (
    <WideFigure
      value={`${String(Math.round(battery.percent))}%`}
      caption={low ? 'Battery low' : 'Battery'}
      tone={low ? 'warning' : 'default'}
    />
  );
}

function Figures({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  return (
    <View className="flex-row items-end gap-4">
      <Live deviceId={deviceId} view={view} />
      <Charge view={view} />
    </View>
  );
}

function WideBrush({
  device,
  view,
  cls,
}: {
  readonly device: Device;
  readonly view: BrushStateView;
  readonly cls: WideClass;
}): ReactNode {
  const room = useRoomName(device.id);
  const now = useMinute();
  return (
    <WideCard
      cls={cls}
      summary={`${device.label}${room === null ? '' : `, ${room}`}. ${summaryOf(view.profile, view)}`}
      visual={<BrushVisual device={device} view={view} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={device.label}
      chip={<BrushStateBadge deviceId={device.id} view={view} />}
      state={
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {subtitleOf(view)} · {linkLine(view, now)}
        </Text>
      }
      figures={[<Figures key="figures" deviceId={device.id} view={view} />]}
    />
  );
}

function lineOf(view: BrushStateView): string {
  const { battery } = view;
  return battery.low && !battery.charging ? `Battery low · ${subtitleOf(view)}` : subtitleOf(view);
}

export function BrushTile({
  device,
  showRoom,
  compact,
}: {
  readonly device: Device;
  readonly showRoom: boolean;
  readonly compact: boolean;
}): ReactNode {
  const state = useBrushState(device.id);
  const room = useRoomName(device.id);
  const view = state.data;
  return (
    <View className={cn('flex-1 justify-between gap-2', !compact && 'flex-row items-center')}>
      {view === undefined ? null : <BrushVisual device={device} view={view} size="tile" />}
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
          {view === undefined ? WAITING : lineOf(view)}
        </Text>
      </View>
    </View>
  );
}

function Wide({ device, cls }: { readonly device: Device; readonly cls: WideClass }): ReactNode {
  const state = useBrushState(device.id);
  useBrushDemand(device.id);
  return state.data === undefined ? (
    <BrushTile device={device} showRoom compact />
  ) : (
    <WideBrush device={device} view={state.data} cls={cls} />
  );
}

export function BrushCardFace({
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
    <BrushTile device={device} showRoom compact />
  );
}
