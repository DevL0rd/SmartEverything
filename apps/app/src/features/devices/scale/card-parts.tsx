import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyGraph, Sparkline } from '../../../components/charts';
import { Glow } from '../../../components/glow';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { DeviceVisual } from '../../device-visuals';
import { WIDE_VISUAL_PX, WideFigure, type WideClass } from '../card/wide-card';
import { MiniRings } from './composition-rings';
import { chartHeight, scaleActions, scaleTicker, type ScaleAction } from './card-model';
import type { Scale } from './use-scale';
import { useScaleStage } from './use-scale';
import { cardPoints } from './trend-model';

const GRAPH_DAYS: Readonly<Record<WideClass, number>> = { m: 30, w: 30, l: 90, xl: 90 };

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

function useRoom(): readonly [number | null, (event: LayoutChangeEvent) => void] {
  const [room, setRoom] = useState<number | null>(null);
  return [
    room,
    (event): void => {
      setRoom(event.nativeEvent.layout.height);
    },
  ];
}

function Trend({
  scale,
  cls,
  height,
}: {
  readonly scale: Scale;
  readonly cls: WideClass;
  readonly height: number;
}): ReactNode {
  const points = cardPoints(
    scale.facts.trend,
    GRAPH_DAYS[cls],
    cls === 'l' || cls === 'xl',
    scale.now,
  );
  return points.length < 2 ? (
    <EmptyGraph text="No weigh-ins yet" height={height} />
  ) : (
    <Sparkline points={points} colour="viz-1" height={height} />
  );
}

export function Graph({
  scale,
  cls,
}: {
  readonly scale: Scale;
  readonly cls: WideClass;
}): ReactNode {
  const [room, onLayout] = useRoom();
  const height = room === null ? null : chartHeight(room);
  const { latest } = scale.facts;
  const composition = cls === 'w' && latest?.outlier === false ? latest.composition : null;
  return (
    <View className="min-h-0 flex-1 gap-1.5">
      <View className="min-h-0 flex-1 justify-end" onLayout={onLayout}>
        {height === null ? null : <Trend scale={scale} cls={cls} height={height} />}
      </View>
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
  narrow,
}: {
  readonly scale: Scale;
  readonly narrow: boolean;
  readonly onOpen: (kind: ScaleAction['kind']) => void;
}): ReactNode[] {
  return scaleActions(scale.facts, scale.pending.length).map((action) => (
    <Button
      key={action.kind}
      label={
        narrow && action.kind === 'queue' ? `Assign ${String(scale.pending.length)}` : action.label
      }
      spoken={action.label}
      variant={action.kind === 'queue' ? 'tonal' : action.filled ? 'filled' : 'text'}
      {...(narrow ? {} : { icon: action.kind === 'queue' ? 'users' : 'user' })}
      onPress={() => {
        onOpen(action.kind);
      }}
    />
  ));
}
