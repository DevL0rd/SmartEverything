import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { withRole } from '@smarteverything/domain';
import { StateTimeline } from '../../../components/charts';
import { Button } from '../../../components/button';
import { useAnchoredMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useDeviceDerived, useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import { useScheduleItems } from '../../automations';
import type { CardFaceProps } from '../card/card-face';
import { GenericCardFace } from '../card/generic-card-face';
import { LiveSpark } from '../card/live-spark';
import {
  isWideClass,
  WIDE_VISUAL_PX,
  WideCard,
  WideFigure,
  type WideClass,
} from '../card/wide-card';
import { PowerToggle } from '../controls/power-toggle';
import { LogTicker } from '../log/log-ticker';
import { deviceModelOf, powerStateOf, valueOf, type PowerState } from '../model/device-model';
import { wattsText } from './relay-model';
import { usePowerTimeline } from './use-power-timeline';

const STRIP_HEIGHT = 28;
const PANEL_STRIP_HEIGHT = 48;

interface RelayRead {
  readonly power: PowerState;
  readonly watts: number | null;
}

function useRelayRead(device: Device): RelayRead {
  const model = deviceModelOf(device);
  const draw = withRole(model.presentation, 'power_draw');
  return useDeviceDerived(
    device.id,
    (values) => {
      const watts = valueOf(values, draw);
      return {
        power: powerStateOf(model, values),
        watts: typeof watts === 'number' ? watts : null,
      };
    },
    [model, draw],
  );
}

function stateLine(read: RelayRead): string {
  switch (read.power) {
    case 'on':
      return 'On';
    case 'off':
      return 'Off';
    case 'offline':
      return 'Offline';
    case 'unknown':
    case 'none':
      return 'Waiting for the first reading';
  }
}

function TimerButton({
  device,
  power,
}: {
  readonly device: Device;
  readonly power: PowerState;
}): ReactNode {
  const items = useScheduleItems(device.id, power);
  const { ref, open, menu } = useAnchoredMenu(items, 'Timer');
  return (
    <View ref={ref} collapsable={false}>
      <Button label="Timer" variant="tonal" icon="timer" onPress={open} />
      {menu}
    </View>
  );
}

function OnOffStrip({
  device,
  live,
  height,
}: {
  readonly device: Device;
  readonly live: boolean;
  readonly height: number;
}): ReactNode {
  const model = deviceModelOf(device);
  const timeline = usePowerTimeline(device.id, model.power?.key ?? null, live);
  return (
    <StateTimeline
      segments={timeline.segments}
      colours={{ on: 'primary' }}
      label="On time in the last 24 hours"
      height={height}
      from={timeline.from}
      to={timeline.to}
      captions={['24 h ago', 'Now']}
      empty="No data yet"
      track="surface-2"
    />
  );
}

function RelayGraph({
  device,
  live,
  height,
  draw,
}: {
  readonly device: Device;
  readonly live: boolean;
  readonly height: number;
  readonly draw: string | null;
}): ReactNode {
  return draw === null ? (
    <OnOffStrip device={device} live={live} height={height} />
  ) : (
    <LiveSpark device={device} capability={draw} colour="primary" height={height} />
  );
}

function drawFigures(read: RelayRead): readonly ReactNode[] {
  return read.watts === null || read.power !== 'on'
    ? []
    : [<WideFigure key="draw" value={wattsText(read.watts)} unit="W" />];
}

function WideRelay({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const read = useRelayRead(device);
  const room = useRoomName(device.id);
  const draw = withRole(deviceModelOf(device).presentation, 'power_draw')?.key ?? null;
  const line = stateLine(read);
  const panel = cls === 'l' || cls === 'xl';
  return (
    <View ref={ref} onLayout={onLayout} className="flex-1" pointerEvents="box-none">
      <WideCard
        cls={cls}
        summary={`${device.label}${room === null ? '' : `, ${room}`}. ${line}${read.watts === null ? '' : `, ${wattsText(read.watts)} watts`}`}
        visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
        title={device.label}
        state={
          <Text
            variant="footnote"
            tone={read.power === 'on' ? 'primary' : 'variant'}
            numberOfLines={1}
          >
            {room === null ? line : `${line} · ${room}`}
          </Text>
        }
        figures={drawFigures(read)}
        graph={
          <RelayGraph
            device={device}
            live={live}
            height={panel ? PANEL_STRIP_HEIGHT : STRIP_HEIGHT}
            draw={draw}
          />
        }
        actions={[
          <PowerToggle key="power" device={device} />,
          <TimerButton key="timer" device={device} power={read.power} />,
        ]}
        ticker={<LogTicker deviceId={device.id} live={live} />}
      />
    </View>
  );
}

export function RelayCard(props: CardFaceProps): ReactNode {
  return isWideClass(props.cls) ? (
    <WideRelay device={props.device} cls={props.cls} />
  ) : (
    <GenericCardFace {...props} />
  );
}
