import type { RobotMoves } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { frameClassOf, type WidgetFrameBox } from '../../components/widget-board';
import { DeviceVisual } from '../../features/device-visuals';
import { WIDE_VISUAL_PX, WideCard, isWideClass, type WideClass } from '../../features/devices';
import { useRoomName } from '../../store/selectors';
import type { Device } from '../../store/state';
import type { RobotDay } from './activity-timeline';
import { ActivityStrip } from './activity-strip';
import { ConversationBody } from './aibi-bodies';
import { AIBI_PLUGIN } from './aibi-data';
import { MoveFailure, QuickMoveButton, MovesMenuButton, useMover } from './robot-actions';
import { fittedCount, useRobotLive, type RobotLive } from './use-robot-card';
import { quickMoves } from './move-model';

const STRIP_HEIGHT = { m: 14, w: 24, l: 24, xl: 24 } as const;
const BAND_GAP = 8;
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

function widthOf(event: LayoutChangeEvent): number {
  return event.nativeEvent.layout.width;
}

function FittedMoves({
  device,
  moves,
}: {
  readonly device: Device;
  readonly moves: RobotMoves;
}): ReactNode {
  const quick = quickMoves(moves.actions, moves.actions.length);
  const mover = useMover(device);
  const [room, setRoom] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | undefined>(undefined);
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({});
  const measure =
    (id: string) =>
    (event: LayoutChangeEvent): void => {
      const width = widthOf(event);
      setWidths((previous) => (previous[id] === width ? previous : { ...previous, [id]: width }));
    };
  const count = fittedCount(
    quick.map((move) => widths[move.id]),
    menu,
    room,
    BAND_GAP,
  );
  return (
    <View
      className="min-w-0 flex-1 flex-row justify-end gap-2"
      pointerEvents="box-none"
      onLayout={(event): void => {
        setRoom(widthOf(event));
      }}
    >
      {quick.slice(0, count).map((move) => (
        <View key={move.id} onLayout={measure(move.id)}>
          <QuickMoveButton move={move} mover={mover} />
        </View>
      ))}
      <View
        onLayout={(event): void => {
          setMenu(widthOf(event));
        }}
      >
        <MovesMenuButton device={device} moves={moves} mover={mover} />
      </View>
    </View>
  );
}

function actionsOf(device: Device, live: RobotLive): readonly ReactNode[] {
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
  if (moves === null || view.asleep || moves.actions.length === 0) {
    return [];
  }
  return [<FittedMoves key="moves" device={device} moves={moves} />];
}

interface Need {
  readonly talked: boolean;
  readonly height: number;
}

function Strip({
  day,
  cls,
  captions,
}: {
  readonly day: RobotDay;
  readonly cls: WideClass;
  readonly captions: boolean;
}): ReactNode {
  const talked = day.segments.length > 0;
  const [room, setRoom] = useState<number | null>(null);
  const [need, setNeed] = useState<Need | null>(null);
  const known = need?.talked === talked ? need.height : null;
  const fits = room === null || known === null || known <= room;
  return (
    <View
      className="min-h-0 flex-1 justify-end"
      onLayout={(event): void => {
        setRoom(event.nativeEvent.layout.height);
      }}
    >
      {fits ? (
        <View
          onLayout={(event): void => {
            setNeed({ talked, height: event.nativeEvent.layout.height });
          }}
        >
          <ActivityStrip day={day} height={STRIP_HEIGHT[cls]} captions={captions} />
        </View>
      ) : null}
    </View>
  );
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

function Quote({
  text,
  lines,
}: {
  readonly text: string | null;
  readonly lines: number;
}): ReactNode {
  return text === null ? null : (
    <Text variant="footnote" numberOfLines={lines}>
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
      titleLines={2}
      chip={<Badge label={view.chip.label} tone={view.chip.tone} />}
      state={
        <Line
          text={view.line}
          critical={view.critical}
          lines={view.asleep || view.problem || panel ? 2 : 1}
        />
      }
      figures={
        view.quote === null ? [] : [<Quote key="quote" text={view.quote} lines={panel ? 2 : 1} />]
      }
      graph={<Strip day={day} cls={cls} captions={panel} />}
      actions={actionsOf(device, live)}
      ticker={tickerOf(device, live)}
      {...(panel ? { log: <ConversationBody status={status} /> } : {})}
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
      state={<Line text={WAITING} critical={false} lines={2} />}
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
}: {
  readonly device: Device;
  readonly showRoom: boolean;
}): ReactNode {
  const live = useRobotLive(device);
  const room = useRoomName(device.id);
  const line = live === null ? WAITING : live.view.line;
  return (
    <View className="flex-1 flex-row items-start gap-3">
      <DeviceVisual device={device} size="tile" {...(live === null ? {} : { state: live.state })} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={2}>
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
    <RobotTile device={device} showRoom />
  );
}
