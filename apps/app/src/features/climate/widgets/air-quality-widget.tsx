import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AIR_BANDS, airBand } from '@smarteverything/domain';
import { Gauge, SegmentBar } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { WidgetFrame, isTall, type WidgetSize } from '../../../components/widget-board';
import { AIR_BAND_COLOUR } from '../../../design/data-colours';
import { titleCase } from '../../../format/text';
import { useComfortReadings } from '../data/use-readings';
import { PM25_SCALE } from '../model/metric-look';
import type { MetricReading } from '../model/comfort';

const PM25: readonly ['pm25'] = ['pm25'];

const PM25_BANDS = PM25_SCALE.bands;

const GAUGE_MAX = PM25_SCALE.max;

const SEGMENTS = PM25_BANDS.map((band) => band.colour);

const SCALE_LABELS = AIR_BANDS.slice(0, PM25_BANDS.length).map(titleCase);

const GAUGE_SIZE: Readonly<Record<WidgetSize, number>> = { M: 104, W: 104, XL: 188 };

function useAirReading(room: string | null): MetricReading | null {
  return useComfortReadings(PM25, room)[0] ?? null;
}

function scalePosition(amount: number): number {
  const index = PM25_BANDS.findIndex((band) => amount <= band.upTo);
  const at = index === -1 ? PM25_BANDS.length - 1 : index;
  const from = at === 0 ? 0 : (PM25_BANDS[at - 1]?.upTo ?? 0);
  const to = PM25_BANDS[at]?.upTo ?? GAUGE_MAX;
  const within = Math.min(1, Math.max(0, (amount - from) / (to - from)));
  return (at + within) / PM25_BANDS.length;
}

function BandScale({
  amount,
  labels,
}: {
  readonly amount: number;
  readonly labels: boolean;
}): ReactNode {
  return (
    <View className="w-full gap-1.5" aria-hidden>
      <SegmentBar segments={SEGMENTS} marker={scalePosition(amount)} label="PM2.5 band" />
      {labels ? (
        <View className="flex-row">
          {SCALE_LABELS.map((label) => (
            <Text key={label} variant="caption" tone="faint" align="center" className="flex-1">
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Dial({
  reading,
  size,
}: {
  readonly reading: MetricReading;
  readonly size: WidgetSize;
}): ReactNode {
  const big = isTall(size);
  return (
    <Gauge
      value={Math.min(reading.amount, GAUGE_MAX)}
      min={0}
      max={GAUGE_MAX}
      bands={PM25_BANDS}
      size={GAUGE_SIZE[size]}
      thickness={big ? 14 : 9}
      label={`PM2.5 ${reading.value}, ${reading.verdict}`}
    >
      <Figure value={reading.value} size={big ? 'xl' : 'm'} stale={reading.stale} />
      {big ? (
        <Text variant="caption" tone="variant">
          {reading.unit ?? reading.label}
        </Text>
      ) : null}
    </Gauge>
  );
}

function Verdict({ reading }: { readonly reading: MetricReading }): ReactNode {
  return (
    <View className="gap-0.5">
      <Text variant="title-2" tone={reading.stale ? 'faint' : reading.tone} numberOfLines={1}>
        {reading.verdict}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {reading.unit === null ? reading.label : `${reading.label} in ${reading.unit}`}
      </Text>
    </View>
  );
}

function Body({
  reading,
  size,
}: {
  readonly reading: MetricReading;
  readonly size: WidgetSize;
}): ReactNode {
  if (isTall(size)) {
    return (
      <View className="flex-1 items-center justify-between gap-3">
        <Dial reading={reading} size={size} />
        <Verdict reading={reading} />
        <BandScale amount={reading.amount} labels />
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <Dial reading={reading} size={size} />
      <View className="min-w-0 flex-1 gap-3">
        <Verdict reading={reading} />
        <BandScale amount={reading.amount} labels={size === 'W'} />
      </View>
    </View>
  );
}

export function AirQualityWidget({
  size,
  room,
}: {
  readonly size: WidgetSize;
  readonly room: string | null;
}): ReactNode {
  const reading = useAirReading(room);
  const band = reading === null || reading.stale ? null : AIR_BAND_COLOUR[airBand(reading.amount)];
  return (
    <WidgetFrame title="Air quality" icon="airVent" accent={band ?? 'air-good'} glow={band}>
      {reading === null ? null : <Body reading={reading} size={size} />}
    </WidgetFrame>
  );
}
