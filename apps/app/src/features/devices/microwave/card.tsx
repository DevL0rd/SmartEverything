import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { withRole, type DeviceLogEntry } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { ProgressBar, StateTimeline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useRoomName } from '../../../store/selectors';
import { HOUR_MS } from '../../../format/time';
import { readMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
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
import { LogTicker } from '../log/log-ticker';
import { deviceModelOf } from '../model/device-model';
import { cardActions } from './card-actions';
import {
  COOKED_STATE,
  cardChip,
  cookedCaptions,
  cookedSegments,
  figureSpecs,
  leftWords,
  stateLine,
} from './card-model';
import { PanelExtras } from './panel-extras';
import type { MicrowaveRun } from './run-model';
import { useCycles } from './use-cycles';
import { useQuick } from './use-quick';
import { useRun } from './use-run';

const STRIP_HEIGHT = 24;
const PANEL_STRIP_HEIGHT = 96;
const SPARK_HEIGHT = 30;
const PANEL_SPARK_HEIGHT = 64;
const COOKED_WINDOW_HOURS = 24;

function figuresOf(run: MicrowaveRun, cls: WideClass): readonly ReactNode[] {
  return figureSpecs(run, cls !== 'w').map(({ key, ...figure }) => (
    <WideFigure key={key} {...figure} />
  ));
}

function CookedToday({
  cycles,
  height,
}: {
  readonly cycles: readonly DeviceLogEntry[];
  readonly height: number;
}): ReactNode {
  const to = readMinute();
  const from = to - COOKED_WINDOW_HOURS * HOUR_MS;
  const segments = cookedSegments(cycles, from, to);
  return (
    <StateTimeline
      segments={segments}
      colours={{ [COOKED_STATE]: 'temp-warm' }}
      label="Cooking in the last 24 hours"
      height={height}
      from={from}
      to={to}
      ticks={segments.map((segment) => segment.start)}
      captions={cookedCaptions(segments.length)}
      empty="Nothing cooked today"
      track="surface-2"
    />
  );
}

function CookingGraph({
  device,
  run,
  height,
  drawKey,
  wide,
}: {
  readonly device: Device;
  readonly run: MicrowaveRun;
  readonly height: number;
  readonly drawKey: string | null;
  readonly wide: boolean;
}): ReactNode {
  return (
    <View className="gap-1.5">
      {wide && drawKey !== null ? (
        <LiveSpark
          device={device}
          capability={drawKey}
          colour="temp-warm"
          height={height > STRIP_HEIGHT ? PANEL_SPARK_HEIGHT : SPARK_HEIGHT}
        />
      ) : null}
      <ProgressBar
        progress={run.progress}
        colour="temp-warm"
        label={`Progress ${String(Math.round((run.progress ?? 0) * 100))} percent`}
        thick={height > STRIP_HEIGHT}
      />
    </View>
  );
}

function CardGraph({
  device,
  run,
  cycles,
  cls,
}: {
  readonly device: Device;
  readonly run: MicrowaveRun;
  readonly cycles: readonly DeviceLogEntry[];
  readonly cls: WideClass;
}): ReactNode {
  const panel = cls === 'l' || cls === 'xl';
  const height = panel ? PANEL_STRIP_HEIGHT : STRIP_HEIGHT;
  const drawKey = withRole(deviceModelOf(device).presentation, 'power_draw')?.key ?? null;
  return run.phase === 'running' || run.phase === 'paused' ? (
    <CookingGraph device={device} run={run} height={height} drawKey={drawKey} wide={cls !== 'm'} />
  ) : (
    <CookedToday cycles={cycles} height={height} />
  );
}

function tickerOf(
  device: Device,
  run: MicrowaveRun,
  cls: WideClass,
  live: boolean,
): ReactNode | undefined {
  const idle = run.phase !== 'running' && run.phase !== 'paused';
  return cls === 'm' || !idle ? undefined : (
    <LogTicker deviceId={device.id} live={live} omit="cycle" />
  );
}

function WideMicrowave({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const run = useRun(device);
  const quick = useQuick(device, live);
  const cycles = useCycles(device.id, live);
  const room = useRoomName(device.id);
  const chip = cardChip(run);
  const line = stateLine(run, cycles[0]);
  const panel = cls === 'l' || cls === 'xl';
  return (
    <View ref={ref} onLayout={onLayout} className="flex-1" pointerEvents="box-none">
      <WideCard
        cls={cls}
        summary={`${device.label}${room === null ? '' : `, ${room}`}. ${chip.label}. ${line}.${leftWords(run)}`}
        visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
        title={device.label}
        chip={<Badge label={chip.label} tone={chip.tone} />}
        state={
          <Text
            variant="footnote"
            tone={run.phase === 'ready' ? 'positive' : 'variant'}
            numberOfLines={2}
          >
            {line}
          </Text>
        }
        figures={figuresOf(run, cls)}
        graph={<CardGraph device={device} run={run} cycles={cycles} cls={cls} />}
        actions={cardActions({ device, run, quick })}
        ticker={tickerOf(device, run, cls, live)}
        log={panel ? <PanelExtras device={device} cycles={cycles} /> : undefined}
      />
    </View>
  );
}

export function MicrowaveCard(props: CardFaceProps): ReactNode {
  return isWideClass(props.cls) ? (
    <WideMicrowave device={props.device} cls={props.cls} />
  ) : (
    <GenericCardFace {...props} />
  );
}
