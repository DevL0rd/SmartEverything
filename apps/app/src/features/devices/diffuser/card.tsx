import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { LevelPill } from '../../../components/level-pill';
import { ReasonLine } from '../../../components/reason-line';
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
  chargeWarningOf,
  diffuserStatus,
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

const STRIP_PX: Readonly<Record<WideClass, number>> = { m: 16, w: 28, l: 48, xl: 48 };

function actionsOf(device: Device, read: DiffuserRead): readonly ReactNode[] {
  if (read.power === 'offline') {
    return [];
  }
  if (read.fault) {
    return [<PowerToggle key="power" device={device} />];
  }
  if (read.power === 'off') {
    return [<TurnOnButton key="on" device={device} />];
  }
  return [
    <SprayButton key="spray" device={device} />,
    <StrengthMenuButton key="strength" device={device} read={read} />,
    <LightSheetButton key="light" device={device} lit={read.light === true} />,
    <PowerToggle key="power" device={device} />,
  ];
}

function BatteryLevel({
  percent,
  charging,
}: {
  readonly percent: number;
  readonly charging: boolean;
}): ReactNode {
  return (
    <LevelPill
      percent={percent}
      label={charging ? `${String(percent)} % charging` : `${String(percent)} %`}
    />
  );
}

function figuresOf(read: DiffuserRead, hours: number | null): readonly ReactNode[] {
  const warning = chargeWarningOf(read);
  return [
    read.battery === null ? null : (
      <BatteryLevel key="battery" percent={read.battery} charging={read.charging} />
    ),
    warning === null ? null : (
      <Text key="low" variant="caption" tone="warning" numberOfLines={1}>
        {warning}
      </Text>
    ),
    hours === null ? null : (
      <Text key="refill" variant="caption" tone="variant" numberOfLines={1}>
        {refillLine(hours, true)}
      </Text>
    ),
  ].filter((figure) => figure !== null);
}

function Ticker({
  deviceId,
  live,
  logged,
}: {
  readonly deviceId: string;
  readonly live: boolean;
  readonly logged: boolean;
}): ReactNode {
  const schedule = useDiffuserSchedule(deviceId);
  if (schedule === null) {
    return logged ? null : <LogTicker deviceId={deviceId} live={live} />;
  }
  return (
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
  return (
    <View ref={ref} onLayout={onLayout} className="flex-1" pointerEvents="box-none">
      <WideCard
        cls={cls}
        summary={summaryOf({ label: device.label, room, read, announceChargeWarning: true })}
        visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
        title={device.label}
        chip={<Badge label={status.label} tone={status.tone} />}
        state={<StateLine read={read} room={room} />}
        figures={figuresOf(read, hours)}
        graph={
          <RhythmStrip
            intervalMinutes={read.rhythm?.intervalMinutes ?? null}
            paused={paused(read)}
            height={STRIP_PX[cls]}
          />
        }
        actions={actionsOf(device, read)}
        ticker={
          read.power === 'offline' ? (
            <ReasonLine text={UNREACHABLE_REASON} />
          ) : (
            <Ticker deviceId={device.id} live={live} logged={panel} />
          )
        }
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
