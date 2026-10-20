import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { frameClassOf, type WidgetFrameBox } from '../../../components/widget-board';
import { cn } from '../../../design/cn';
import { WIDE_VISUAL_PX, WideCard, isWideClass, type WideClass } from '../../../features/devices';
import { minutesOfDay } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useBottleStatus } from '../data/bottle-data';
import { ageLine, levelLine } from '../model/bottle-model';
import { BottleActions } from './bottle-actions';
import { BottleFigure } from './bottle-figure';
import { StateChip } from './state-chip';
import { TodayRing } from './today-ring';

const WAITING = 'Waiting for the bottle…';
const RING = 88;

function Wide({
  device,
  view,
  cls,
}: {
  readonly device: Device;
  readonly view: BottleStatusView;
  readonly cls: WideClass;
}): ReactNode {
  const room = useRoomName(device.id);
  const now = useMinute();
  return (
    <WideCard
      cls={cls}
      summary={`${device.label}${room === null ? '' : `, ${room}`}. ${levelLine(view)}. ${ageLine(view, now)}`}
      visual={<BottleFigure device={device} view={view} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={device.label}
      chip={<StateChip view={view} />}
      state={
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {levelLine(view)}
        </Text>
      }
      figures={[
        <TodayRing
          key="ring"
          today={view.today}
          minuteOfDay={minutesOfDay(now)}
          size={RING}
          label={false}
        />,
      ]}
    />
  );
}

export function BottleTile({
  device,
  showRoom,
  compact,
}: {
  readonly device: Device;
  readonly showRoom: boolean;
  readonly compact: boolean;
}): ReactNode {
  const status = useBottleStatus(device.id);
  const room = useRoomName(device.id);
  const now = useMinute();
  const view = status.data;
  return (
    <View
      className={cn('flex-1 gap-2', compact ? 'justify-between' : 'flex-row items-center gap-3')}
    >
      {view === undefined ? null : <BottleFigure device={device} view={view} size="tile" />}
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
          {view === undefined ? WAITING : ageLine(view, now)}
        </Text>
      </View>
    </View>
  );
}

export function BottleCardFace({
  device,
  frame,
}: {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
  readonly size: string;
}): ReactNode {
  const view = useBottleStatus(device.id).data;
  const cls = frameClassOf(frame);
  return view !== undefined && isWideClass(cls) ? (
    <Wide device={device} view={view} cls={cls} />
  ) : (
    <BottleTile device={device} showRoom compact />
  );
}

export function BottleQuick({ device }: { readonly device: Device }): ReactNode {
  const view = useBottleStatus(device.id).data;
  return view === undefined ? null : <BottleActions view={view} />;
}
