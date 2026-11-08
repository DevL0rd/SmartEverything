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
import {
  SPARK_MIN_PX,
  TIMELINE_CAPTIONS_PX,
  emptyStripPx,
  shownPx,
  trackPx,
  useGraphRoom,
} from '../sensors/layout';
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
const SPARK_GAP = 6;
const THIN_BAR = 6;
const THICK_BAR = 10;

function figuresOf(run: MicrowaveRun): readonly ReactNode[] {
  return figureSpecs(run).map(({ key, ...figure }) => <WideFigure key={key} {...figure} />);
}

function CookedToday({
  cycles,
  track,
}: {
  readonly cycles: readonly DeviceLogEntry[];
  readonly track: number;
}): ReactNode {
  const { room, onLayout } = useGraphRoom(track + TIMELINE_CAPTIONS_PX);
  const to = readMinute();
  const from = to - COOKED_WINDOW_HOURS * HOUR_MS;
  const segments = cookedSegments(cycles, from, to);
  const height = segments.length === 0 ? emptyStripPx(STRIP_HEIGHT, room) : trackPx(track, room);
  return (
    <View onLayout={onLayout} className="min-h-0 flex-1 justify-end">
      {height === null ? null : (
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
      )}
    </View>
  );
}

function CookingGraph({
  device,
  run,
  panel,
  drawKey,
}: {
  readonly device: Device;
  readonly run: MicrowaveRun;
  readonly panel: boolean;
  readonly drawKey: string | null;
}): ReactNode {
  const cap = panel ? PANEL_SPARK_HEIGHT : SPARK_HEIGHT;
  const bar = SPARK_GAP + (panel ? THICK_BAR : THIN_BAR);
  const { room, onLayout } = useGraphRoom(cap + bar);
  const spark = shownPx(cap, room - bar, SPARK_MIN_PX);
  return (
    <View onLayout={onLayout} className="min-h-0 flex-1 justify-end gap-1.5">
      {drawKey === null || spark === null ? null : (
        <LiveSpark device={device} capability={drawKey} colour="temp-warm" height={spark} />
      )}
      <ProgressBar
        progress={run.progress}
        colour="temp-warm"
        label={`Progress ${String(Math.round((run.progress ?? 0) * 100))} percent`}
        thick={panel}
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
  const drawKey = withRole(deviceModelOf(device).presentation, 'power_draw')?.key ?? null;
  return run.phase === 'running' || run.phase === 'paused' ? (
    <CookingGraph device={device} run={run} panel={panel} drawKey={drawKey} />
  ) : (
    <CookedToday cycles={cycles} track={panel ? PANEL_STRIP_HEIGHT : STRIP_HEIGHT} />
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
        figures={figuresOf(run)}
        graph={<CardGraph device={device} run={run} cycles={cycles} cls={cls} />}
        actions={cardActions({ device, run, quick })}
        ticker={tickerOf(device, run, cls, live)}
        log={<PanelExtras device={device} cycles={cycles} />}
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
