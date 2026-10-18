import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { LevelPill } from '../../../components/level-pill';
import { Text } from '../../../components/text';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import type { CardFaceProps } from '../card/card-face';
import { GenericCardFace } from '../card/generic-card-face';
import { isWideClass, WIDE_VISUAL_PX, WideCard, type WideClass } from '../card/wide-card';
import { UNREACHABLE_REASON } from '../controls/guard';
import { PowerToggle } from '../controls/power-toggle';
import { LogMini } from '../log/log-mini';
import { LogTicker } from '../log/log-ticker';
import {
  diffuserStatus,
  lowBattery,
  paused,
  refillLine,
  showsFault,
  stateText,
  summaryOf,
} from './diffuser-model';
import type { DiffuserRead } from './diffuser-read';
import { LightSheetButton } from './light-sheet';
import { RhythmStrip } from './rhythm-strip';
import { SprayButton } from './spray-button';
import { StrengthMenuButton } from './strength-control';
import { TurnOnButton } from './turn-on-button';
import { useDiffuserRead, useDiffuserSchedule, useHoursSinceRefill } from './use-diffuser';

const STRIP_HEIGHT = 26;
const PANEL_STRIP_HEIGHT = 56;

function Reason({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={2} className="flex-1">
      {text}
    </Text>
  );
}

function actionsOf(device: Device, read: DiffuserRead, cls: WideClass): readonly ReactNode[] {
  if (read.power === 'offline') {
    return [<Reason key="why" text={UNREACHABLE_REASON} />];
  }
  if (read.fault) {
    return [<PowerToggle key="power" device={device} />];
  }
  if (read.power === 'off') {
    return [<TurnOnButton key="on" device={device} />];
  }
  const panel = cls === 'l' || cls === 'xl';
  return [
    <SprayButton key="spray" device={device} />,
    ...(cls === 'm' ? [] : [<StrengthMenuButton key="strength" device={device} />]),
    ...(panel ? [<LightSheetButton key="light" device={device} />] : []),
    <PowerToggle key="power" device={device} />,
  ];
}

function figuresOf({
  read,
  hours,
}: {
  readonly read: DiffuserRead;
  readonly hours: number | null;
}): readonly ReactNode[] {
  return [
    ...(read.battery === null
      ? []
      : [
          <LevelPill
            key="battery"
            percent={read.battery}
            label={
              read.charging ? `${String(read.battery)} % charging` : `${String(read.battery)} %`
            }
          />,
        ]),
    ...(lowBattery(read) && !read.charging
      ? [
          <Text key="low" variant="caption" tone="warning" numberOfLines={1}>
            Charge soon
          </Text>,
        ]
      : []),
    ...(hours === null
      ? []
      : [
          <Text key="refill" variant="caption" tone="variant" numberOfLines={1}>
            {refillLine(hours)}
          </Text>,
        ]),
  ];
}

function Ticker({
  deviceId,
  live,
}: {
  readonly deviceId: string;
  readonly live: boolean;
}): ReactNode {
  const schedule = useDiffuserSchedule(deviceId);
  return schedule === null ? (
    <LogTicker deviceId={deviceId} live={live} />
  ) : (
    <Text variant="caption" tone="faint" numberOfLines={1} align="end">
      {schedule.text}
    </Text>
  );
}

function StateLine({
  read,
  room,
}: {
  readonly read: DiffuserRead;
  readonly room: string | null;
}): ReactNode {
  const text = stateText(read, room);
  return text === '' ? null : (
    <Text
      variant="footnote"
      tone={showsFault(read) ? 'critical' : 'variant'}
      numberOfLines={read.fault ? 2 : 1}
    >
      {text}
    </Text>
  );
}

function WideDiffuser({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const read = useDiffuserRead(device);
  const room = useRoomName(device.id);
  const hours = useHoursSinceRefill(device.id);
  const status = diffuserStatus(read);
  const panel = cls === 'l' || cls === 'xl';
  const ticker =
    panel || read.power === 'offline' ? null : <Ticker deviceId={device.id} live={live} />;
  return (
    <View ref={ref} onLayout={onLayout} className="flex-1" pointerEvents="box-none">
      <WideCard
        cls={cls}
        summary={summaryOf({ label: device.label, room, read })}
        visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
        title={device.label}
        chip={<Badge label={status.label} tone={status.tone} />}
        state={<StateLine read={read} room={room} />}
        figures={figuresOf({ read, hours })}
        graph={
          <RhythmStrip
            intervalMinutes={read.rhythm?.intervalMinutes ?? null}
            paused={paused(read)}
            height={panel ? PANEL_STRIP_HEIGHT : STRIP_HEIGHT}
          />
        }
        actions={actionsOf(device, read, cls)}
        {...(ticker === null ? {} : { ticker })}
        {...(panel ? { log: <LogMini deviceId={device.id} live={live} /> } : {})}
      />
    </View>
  );
}

export function DiffuserCard(props: CardFaceProps): ReactNode {
  return isWideClass(props.cls) ? (
    <WideDiffuser device={props.device} cls={props.cls} />
  ) : (
    <GenericCardFace {...props} />
  );
}
