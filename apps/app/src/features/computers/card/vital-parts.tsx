import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Sparkline } from '../../../components/charts';
import { FigureText } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import type { ColourRole } from '../../../design/tokens';
import { decimal } from '../../../format/number';
import { sameJson } from '../../../store/same-json';
import { useDeviceDerived } from '../../../store/selectors';
import { useComputerSelect } from '../data/computer-metrics';
import { useSeriesSet } from '../data/series-set';
import {
  levelOf,
  specsOf,
  spokenVital,
  vitalsOfHeadlines,
  vitalsOfSummary,
  type Level,
  type VitalKey,
  type VitalSpec,
  type Vitals,
} from '../model/card-vitals';

const RECENT_SAMPLES = 60;
const PERCENT: readonly [number, number] = [0, 100];

const FILL: Readonly<Partial<Record<ColourRole, string>>> = {
  'viz-blue': 'bg-viz-blue',
  'viz-magenta': 'bg-viz-magenta',
  'viz-violet': 'bg-viz-violet',
};

const LEVEL_FILL: Readonly<Record<Level, string>> = {
  normal: 'bg-positive',
  warm: 'bg-warning',
  hot: 'bg-critical',
};

const LEVEL_TONE: Readonly<Record<Level, Tone>> = {
  normal: 'variant',
  warm: 'warning',
  hot: 'critical',
};

function LiveVitals({
  deviceId,
  children,
}: {
  readonly deviceId: string;
  readonly children: (vitals: Vitals) => ReactNode;
}): ReactNode {
  const vitals = useComputerSelect(deviceId, (parts) => vitalsOfSummary(parts.summary), sameJson);
  return vitals === null ? null : children(vitals);
}

function HeldVitals({
  deviceId,
  children,
}: {
  readonly deviceId: string;
  readonly children: (vitals: Vitals) => ReactNode;
}): ReactNode {
  const vitals = useDeviceDerived(deviceId, vitalsOfHeadlines, [], sameJson);
  return vitals === null ? null : children(vitals);
}

function WithVitals({
  deviceId,
  stale,
  children,
}: {
  readonly deviceId: string;
  readonly stale: boolean;
  readonly children: (vitals: Vitals) => ReactNode;
}): ReactNode {
  return stale ? (
    <HeldVitals deviceId={deviceId}>{children}</HeldVitals>
  ) : (
    <LiveVitals deviceId={deviceId}>{children}</LiveVitals>
  );
}

function TempTag({
  celsius,
  stale,
}: {
  readonly celsius: number;
  readonly stale: boolean;
}): ReactNode {
  const level = levelOf(celsius);
  return (
    <View className="flex-row items-center gap-1">
      <View
        aria-hidden
        className={cn('size-1.5 rounded-full', stale ? 'bg-on-surface-faint' : LEVEL_FILL[level])}
      />
      <Text
        variant="caption"
        tone={stale ? 'faint' : LEVEL_TONE[level]}
        numberOfLines={1}
        className="tabular"
      >
        {`${decimal(celsius)} °C`}
      </Text>
    </View>
  );
}

function LoadBar({
  percent,
  colour,
  stale,
}: {
  readonly percent: number;
  readonly colour: ColourRole;
  readonly stale: boolean;
}): ReactNode {
  const level = levelOf(percent);
  const width: ViewStyle = { flexGrow: Math.min(1, Math.max(0, percent / 100)), flexBasis: 0 };
  const fill = level === 'normal' ? (FILL[colour] ?? 'bg-primary') : LEVEL_FILL[level];
  return (
    <View
      aria-hidden
      className={cn(
        'h-1 flex-row overflow-hidden rounded-full bg-surface-3',
        stale && 'opacity-50',
      )}
    >
      <View style={width} className={cn('h-full rounded-full', fill)} />
    </View>
  );
}

export function SeriesSpark({
  deviceId,
  seriesId,
  colour,
  height,
  stale,
  domain,
}: {
  readonly deviceId: string;
  readonly seriesId: string;
  readonly colour: ColourRole;
  readonly height: number;
  readonly stale: boolean;
  readonly domain: readonly [number, number] | undefined;
}): ReactNode {
  const [points] = useSeriesSet(deviceId, [seriesId]);
  return (
    <Sparkline
      points={(points ?? []).slice(-RECENT_SAMPLES)}
      colour={stale ? 'on-surface-faint' : colour}
      height={height}
      area
      {...(domain === undefined ? {} : { domain })}
    />
  );
}

export interface TileLook {
  readonly spark: number | null;
  readonly inline: boolean;
}

interface TileProps {
  readonly deviceId: string;
  readonly spec: VitalSpec;
  readonly vitals: Vitals;
  readonly stale: boolean;
  readonly look: TileLook;
}

function TileSpark({ deviceId, spec, stale, look }: TileProps): ReactNode {
  if (look.spark === null) return null;
  return (
    <SeriesSpark
      deviceId={deviceId}
      seriesId={spec.seriesId}
      colour={spec.colour}
      height={look.spark}
      stale={stale}
      domain={PERCENT}
    />
  );
}

function TileFigure({
  load,
  stale,
}: {
  readonly load: number;
  readonly stale: boolean;
}): ReactNode {
  return (
    <FigureText
      text={decimal(load)}
      unit="%"
      size="s"
      tone={levelOf(load) === 'hot' ? 'critical' : 'default'}
      stale={stale}
    />
  );
}

function VitalTile(props: TileProps): ReactNode {
  const { spec, vitals, stale, look } = props;
  const load = spec.load(vitals);
  if (load === null) return null;
  const temperature = spec.temperature(vitals);
  return (
    <View
      accessible
      accessibilityLabel={spokenVital(spec.label, load, temperature)}
      className="min-w-0 flex-1 gap-1"
    >
      <View className="flex-row items-center justify-between gap-1">
        <Text variant="caption" tone="variant">
          {spec.label}
        </Text>
        {temperature === null ? null : <TempTag celsius={temperature} stale={stale} />}
      </View>
      {look.inline ? (
        <View className="min-w-0 flex-row items-end gap-2">
          <TileFigure load={load} stale={stale} />
          <View className="min-w-0 flex-1">
            <TileSpark {...props} />
          </View>
        </View>
      ) : (
        <TileFigure load={load} stale={stale} />
      )}
      <LoadBar percent={load} colour={spec.colour} stale={stale} />
      {look.inline ? null : <TileSpark {...props} />}
    </View>
  );
}

export type TileLooks = Readonly<Record<VitalKey, TileLook>>;

export function VitalRow({
  deviceId,
  stale,
  looks,
  className = 'flex-row gap-3',
  extra,
}: {
  readonly deviceId: string;
  readonly stale: boolean;
  readonly looks: TileLooks;
  readonly className?: string;
  readonly extra?: ReactNode;
}): ReactNode {
  return (
    <WithVitals deviceId={deviceId} stale={stale}>
      {(vitals) => (
        <View className={className} pointerEvents="none">
          {specsOf(vitals).map((spec) => (
            <VitalTile
              key={spec.key}
              deviceId={deviceId}
              spec={spec}
              vitals={vitals}
              stale={stale}
              look={looks[spec.key]}
            />
          ))}
          {extra}
        </View>
      )}
    </WithVitals>
  );
}
