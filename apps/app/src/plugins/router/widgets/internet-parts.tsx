import type { RouterSnapshot, SpeedTestResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ProgressBar, Sparkline } from '../../../components/charts';
import { Figure, type FigureSize } from '../../../components/figure';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import type { HeroFigure } from '../../shared/service-hero';
import type { HeroModel } from '../overview/hero-model';
import { withLatest } from '../overview/traffic-model';
import { useMegabitSeries } from '../overview/use-router-series';
import type { SpeedTestRun } from '../router-data';
import { latestSample, readingLine } from './internet-model';
import { phaseShare } from './speed-progress';
import { staleCaptionOf } from './stale-caption';

export function isDown(hero: HeroModel): boolean {
  return !hero.stale && hero.tone === 'critical';
}

function unitOf(figure: HeroFigure, arrow: string): string {
  return figure.unit === undefined ? arrow : `${figure.unit} ${arrow}`;
}

export function StaleLine({
  text,
  spoken,
  critical,
}: {
  readonly text: string;
  readonly spoken: string;
  readonly critical: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      {critical ? <Icon name="warning" size={16} tone="critical" /> : null}
      <Text
        variant="footnote"
        tone={critical ? 'critical' : 'variant'}
        numberOfLines={1}
        className="shrink"
        accessibilityLabel={spoken}
      >
        {text}
      </Text>
    </View>
  );
}

export function DownNotice({ size }: { readonly size: 'body' | 'tile' }): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      {size === 'tile' ? null : <Icon name="warning" size={20} tone="critical" />}
      <Text variant="body-strong" tone="critical" numberOfLines={2} className="shrink">
        Internet is down
      </Text>
    </View>
  );
}

export function Figures({
  hero,
  size,
}: {
  readonly hero: HeroModel;
  readonly size: FigureSize;
}): ReactNode {
  if (isDown(hero)) {
    return <DownNotice size="body" />;
  }
  const [download, upload] = hero.figures;
  return (
    <View className="flex-row items-baseline gap-4">
      <Figure value={download.value} unit={unitOf(download, '↓')} size={size} stale={hero.stale} />
      <Figure value={upload.value} unit={unitOf(upload, '↑')} size="m" stale={hero.stale} />
    </View>
  );
}

export function Caption({
  snapshot,
  hero,
  last,
  now,
}: {
  readonly snapshot: RouterSnapshot;
  readonly hero: HeroModel;
  readonly last: SpeedTestResult | null;
  readonly now: number;
}): ReactNode {
  const stale = staleCaptionOf(snapshot.connection, now);
  if (stale !== null) {
    return <StaleLine text={stale.long} spoken={stale.long} critical={stale.critical} />;
  }
  const line = isDown(hero) ? (hero.facts[0] ?? null) : readingLine(snapshot, last);
  return line === null ? null : (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      {line}
    </Text>
  );
}

export function Progress({ run }: { readonly run: SpeedTestRun }): ReactNode {
  return (
    <ProgressBar
      progress={phaseShare(run.phase)}
      colour="info"
      label={run.line ?? 'Speed test running'}
    />
  );
}

export function Trend({
  deviceId,
  snapshot,
  capability,
  hours,
  colour,
  height,
}: {
  readonly deviceId: string;
  readonly snapshot: RouterSnapshot;
  readonly capability: 'download_rate' | 'upload_rate';
  readonly hours: number;
  readonly colour: ColourRole;
  readonly height: number;
}): ReactNode {
  const series = useMegabitSeries(deviceId, capability, hours);
  const points = withLatest(
    series.points,
    latestSample(snapshot, capability === 'download_rate' ? 'downloadMbps' : 'uploadMbps'),
  );
  return points.length < 2 ? null : (
    <View aria-hidden>
      <Sparkline points={points} colour={colour} height={height} area />
    </View>
  );
}
