import type { BottleStatusView } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { decimal } from '../../../format/number';
import { minutesOfDay } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { LevelChart } from '../charts/day-chart';
import { BottleArt } from '../components/bottle-figure';
import { InsightChips } from '../components/insight-chips';
import { StateChip } from '../components/state-chip';
import { TodayRing } from '../components/today-ring';
import { ageLine, batteryLine, lastDrinkLine } from '../model/bottle-model';
import { bodyHeightOf, faceKindOf } from '../model/widget-model';

interface FaceProps {
  readonly device: Device;
  readonly view: BottleStatusView;
}

const NARROW_BELOW = 344;
const COMPACT_RING_PX = 72;
const STRIP_RING_PX = 88;
const PANEL_RING_PX = 168;
const LEVEL_MIN = 72;

function Level({
  view,
  compact,
}: {
  readonly view: BottleStatusView;
  readonly compact: boolean;
}): ReactNode {
  const { ml } = view.level;
  if (ml === null) {
    return <Text variant="body-strong">Level unknown</Text>;
  }
  const value = decimal(Math.round(ml));
  if (!compact) {
    return <Figure value={value} unit="ml in the bottle" size="m" />;
  }
  return (
    <View className="flex-row flex-wrap items-baseline gap-x-1">
      <Figure value={value} unit="ml" size="s" />
      <Text variant="footnote" tone="variant">
        inside
      </Text>
    </View>
  );
}

function Summary({
  view,
  detail,
  compact = false,
  row = false,
}: {
  readonly view: BottleStatusView;
  readonly detail: boolean;
  readonly compact?: boolean;
  readonly row?: boolean;
}): ReactNode {
  const now = useMinute();
  return (
    <View className={cn('min-w-0 flex-1', compact ? 'gap-0.5' : 'gap-1', row && 'max-w-72')}>
      <Level view={view} compact={compact} />
      <Text variant="caption" tone="variant" numberOfLines={2}>
        {detail ? `${lastDrinkLine(view, now)} · ${batteryLine(view)}` : ageLine(view, now)}
      </Text>
      <View className="flex-row items-center gap-2">
        <StateChip view={view} />
        {detail ? (
          <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
            {ageLine(view, now)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function FilledLevel({
  view,
  minute,
}: {
  readonly view: BottleStatusView;
  readonly minute: number;
}): ReactNode {
  const [space, setSpace] = useState(0);
  return (
    <View
      className="min-h-0 flex-1 justify-end"
      onLayout={(event) => {
        setSpace(event.nativeEvent.layout.height);
      }}
    >
      <LevelChart
        today={view.today}
        body={view.body}
        nowMinute={minute}
        height={Math.max(LEVEL_MIN, space)}
      />
    </View>
  );
}

function Ring({
  view,
  minute,
  size,
}: {
  readonly view: BottleStatusView;
  readonly minute: number;
  readonly size: number;
}): ReactNode {
  return <TodayRing today={view.today} minuteOfDay={minute} size={size} label={false} />;
}

interface LaneProps {
  readonly view: BottleStatusView;
  readonly minute: number;
  readonly body: number;
  readonly compact: boolean;
}

function WideLane({ view, minute, body }: LaneProps): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row gap-6">
      <View className="min-w-0 flex-1 gap-3">
        <Summary view={view} detail />
        <FilledLevel view={view} minute={minute} />
        <InsightChips view={view} skip={['best-day']} />
      </View>
      <Ring view={view} minute={minute} size={Math.min(body, PANEL_RING_PX)} />
    </View>
  );
}

function TallLane({ view, minute, compact }: LaneProps): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-3">
      <View className={cn('min-w-0 gap-3', !compact && 'flex-row')}>
        <Summary view={view} detail={false} compact={compact} />
        <Ring view={view} minute={minute} size={COMPACT_RING_PX} />
      </View>
      <FilledLevel view={view} minute={minute} />
    </View>
  );
}

function ShortLane({
  view,
  minute,
  body,
  compact,
  row,
}: LaneProps & { readonly row: boolean }): ReactNode {
  const ring = Math.min(body, compact ? COMPACT_RING_PX : STRIP_RING_PX);
  return (
    <View className={cn('min-w-0 flex-1 flex-row', compact ? 'gap-3' : 'gap-4')}>
      <Summary view={view} detail={row} compact={compact} row={row} />
      {row ? (
        <View className="min-w-0 flex-1">
          <LevelChart today={view.today} body={view.body} nowMinute={minute} height={body} />
        </View>
      ) : null}
      <Ring view={view} minute={minute} size={ring} />
    </View>
  );
}

export function BottleFace({ device, view }: FaceProps): ReactNode {
  const { cls, frame } = useWidgetFace();
  const kind = faceKindOf(cls);
  const lane = {
    view,
    minute: minutesOfDay(useMinute()),
    body: bodyHeightOf(frame),
    compact: frame.width < NARROW_BELOW,
  };
  return (
    <View className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}>
      <BottleArt device={device} view={view} />
      {cls === 'xl' ? <WideLane {...lane} /> : null}
      {kind === 'panel' && cls !== 'xl' ? <TallLane {...lane} /> : null}
      {kind === 'panel' ? null : <ShortLane {...lane} row={kind === 'row'} />}
    </View>
  );
}
