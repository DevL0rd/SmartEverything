import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { frameClassOf, type WidgetFrameBox } from '../../components/widget-board';
import { cn } from '../../design/cn';
import { DeviceVisual } from '../../features/device-visuals';
import { WIDE_VISUAL_PX, WideCard, isWideClass, type WideClass } from '../../features/devices';
import { useRoomName } from '../../store/selectors';
import type { Device } from '../../store/state';
import { ActivityStrip } from './activity-strip';
import { ConversationBody } from './aibi-bodies';
import { AIBI_PLUGIN } from './aibi-data';
import { MoveFailure, QuickMoveButton, MovesMenuButton } from './robot-actions';
import { useRobotLive, type RobotLive } from './use-robot-card';
import { quickMoves } from './move-model';

const STRIP_HEIGHT = { m: 14, w: 24, l: 24, xl: 24 } as const;
const QUICK_COUNT = { m: 1, w: 2, l: 2, xl: 3 } as const;
const WAITING = 'Waiting for AIBI…';
const SLEEPING_TICKER = 'Moves wait until it wakes';

function Line({
  text,
  critical,
  lines = 1,
}: {
  readonly text: string;
  readonly critical: boolean;
  readonly lines?: number;
}): ReactNode {
  return (
    <Text variant="footnote" tone={critical ? 'critical' : 'variant'} numberOfLines={lines}>
      {text}
    </Text>
  );
}

function actionsOf(device: Device, live: RobotLive, cls: WideClass): readonly ReactNode[] {
  const { moves, view } = live;
  if (view.problem) {
    return view.settings
      ? [
          <Button
            key="settings"
            label="Open settings"
            icon="settings"
            variant="tonal"
            href={href.pluginSettings(AIBI_PLUGIN)}
          />,
        ]
      : [];
  }
  if (moves === null || view.asleep) {
    return [];
  }
  return [
    ...quickMoves(moves.actions, QUICK_COUNT[cls]).map((move) => (
      <QuickMoveButton key={move.id} device={device} move={move} />
    )),
    moves.actions.length === 0 ? null : (
      <MovesMenuButton key="menu" device={device} moves={moves} />
    ),
  ].filter((action) => action !== null);
}

function tickerOf(device: Device, live: RobotLive): ReactNode {
  if (live.view.problem) {
    return null;
  }
  if (live.view.asleep) {
    return (
      <Text variant="caption" tone="faint" numberOfLines={1} align="end">
        {SLEEPING_TICKER}
      </Text>
    );
  }
  return <MoveFailure device={device} />;
}

function Quote({ text }: { readonly text: string | null }): ReactNode {
  return text === null ? null : (
    <Text variant="footnote" numberOfLines={1}>
      {text}
    </Text>
  );
}

function WideRobot({
  device,
  cls,
  live,
}: {
  readonly device: Device;
  readonly cls: WideClass;
  readonly live: RobotLive;
}): ReactNode {
  const room = useRoomName(device.id);
  const { view, status, state, day } = live;
  const panel = cls === 'l' || cls === 'xl';
  return (
    <WideCard
      cls={cls}
      summary={`${device.label}${room === null ? '' : `, ${room}`}. ${view.chip.label}. ${view.line}`}
      visual={<DeviceVisual device={device} state={state} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={device.label}
      chip={<Badge label={view.chip.label} tone={view.chip.tone} />}
      state={
        <Line
          text={view.line}
          critical={view.critical}
          lines={view.asleep || view.problem ? 2 : 1}
        />
      }
      figures={view.quote === null ? [] : [<Quote key="quote" text={view.quote} />]}
      graph={<ActivityStrip day={day} height={STRIP_HEIGHT[cls]} captions={panel} />}
      actions={actionsOf(device, live, cls)}
      ticker={tickerOf(device, live)}
      {...(panel ? { log: <ConversationBody status={status} size="XL" /> } : {})}
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
      state={<Line text={WAITING} critical={false} />}
    />
  );
}

function Wide({ device, cls }: { readonly device: Device; readonly cls: WideClass }): ReactNode {
  const live = useRobotLive(device);
  return live === null ? (
    <Waiting device={device} cls={cls} />
  ) : (
    <WideRobot device={device} cls={cls} live={live} />
  );
}

export function RobotTile({
  device,
  showRoom,
  compact,
}: {
  readonly device: Device;
  readonly showRoom: boolean;
  readonly compact: boolean;
}): ReactNode {
  const live = useRobotLive(device);
  const room = useRoomName(device.id);
  const line = live === null ? WAITING : live.view.line;
  return (
    <View className={cn('flex-1 justify-between gap-2', !compact && 'flex-row items-center')}>
      <DeviceVisual device={device} size="tile" {...(live === null ? {} : { state: live.state })} />
      <View className="min-w-0 gap-0.5">
        <Text variant="body-strong" numberOfLines={compact ? 2 : 1}>
          {device.label}
        </Text>
        {showRoom && room !== null ? (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {room}
          </Text>
        ) : null}
        <Line text={line} critical={live?.view.critical === true} lines={2} />
      </View>
    </View>
  );
}

export function RobotCardFace({
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
    <RobotTile device={device} showRoom compact />
  );
}
