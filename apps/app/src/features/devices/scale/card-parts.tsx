import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyGraph, Sparkline } from '../../../components/charts';
import { Glow } from '../../../components/glow';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { DeviceVisual } from '../../device-visuals';
import { WIDE_VISUAL_PX, WideFigure, type WideClass } from '../card/wide-card';
import { MiniRings } from './composition-rings';
import { scaleActions, scaleTicker, type ScaleAction } from './card-model';
import type { Scale } from './use-scale';
import { useScaleStage } from './use-scale';
import { cardPoints } from './trend-model';

const GRAPH_DAYS: Readonly<Record<WideClass, number>> = { m: 30, w: 30, l: 90, xl: 90 };
const GRAPH_HEIGHT: Readonly<Record<WideClass, number>> = { m: 34, w: 40, l: 120, xl: 120 };

export function Stage({
  scale,
  cls,
}: {
  readonly scale: Scale;
  readonly cls: WideClass;
}): ReactNode {
  const { facts, device } = scale;
  const state = useScaleStage(device, facts);
  const glow =
    facts.latest === null || facts.stale ? null : facts.latest.outlier ? 'warning' : 'positive';
  return (
    <View className="items-center justify-center overflow-hidden rounded-lg bg-surface-3">
      {glow === null ? null : <Glow colour={glow} />}
      <DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} state={state} />
    </View>
  );
}

export function figuresOf({
  scale,
  cls,
}: {
  readonly scale: Scale;
  readonly cls: WideClass;
}): ReactNode[] {
  const { latest, stale } = scale.facts;
  if (latest === null) {
    return [];
  }
  const composition = latest.composition;
  const figures = [
    <WideFigure
      key="kg"
      value={decimal(latest.kg, 1)}
      unit="kg"
      tone={latest.outlier ? 'warning' : 'default'}
      stale={stale}
    />,
  ];
  if (latest.outlier || latest.bmi === null) {
    return figures;
  }
  figures.push(<WideFigure key="bmi" value={decimal(latest.bmi, 1)} unit="BMI" stale={stale} />);
  if (cls === 'm' || composition === null) {
    return figures;
  }
  figures.push(
    <WideFigure
      key={cls === 'w' ? 'fat' : 'score'}
      value={
        cls === 'w' ? decimal(composition.body_fat_percent, 0) : decimal(composition.body_score, 0)
      }
      unit={cls === 'w' ? '% fat' : 'score'}
      stale={stale}
    />,
  );
  return figures;
}

export function Graph({
  scale,
  cls,
}: {
  readonly scale: Scale;
  readonly cls: WideClass;
}): ReactNode {
  const { trend, latest } = scale.facts;
  const height = GRAPH_HEIGHT[cls];
  const points = cardPoints(trend, GRAPH_DAYS[cls], cls === 'l' || cls === 'xl', scale.now);
  if (points.length < 2) {
    return <EmptyGraph text="No weigh-ins yet" height={height} />;
  }
  const composition = cls === 'w' && latest?.outlier === false ? latest.composition : null;
  return (
    <View className="gap-1.5">
      <Sparkline points={points} colour="viz-1" height={height} />
      {composition === null ? null : <MiniRings composition={composition} />}
    </View>
  );
}

export function tickerOf({ scale }: { readonly scale: Scale }): ReactNode {
  const text = scaleTicker(scale.facts, scale.pending.length);
  return text === null ? undefined : (
    <Text variant="caption" tone="variant" numberOfLines={1}>
      {text}
    </Text>
  );
}

export function actionsOf({
  scale,
  onOpen,
}: {
  readonly scale: Scale;
  readonly onOpen: (kind: ScaleAction['kind']) => void;
}): ReactNode[] {
  return scaleActions(scale.facts, scale.pending.length).map((action) => (
    <Button
      key={action.kind}
      label={action.label}
      variant={action.filled ? 'filled' : 'text'}
      icon={action.kind === 'queue' ? 'users' : 'user'}
      onPress={() => {
        onOpen(action.kind);
      }}
    />
  ));
}
