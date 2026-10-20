import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc } from '../../../components/charts';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Score } from '../model/scores';
import { scorePartRowsOf, scoreWordOf, type ScorePartRow } from '../model/sleep-summary';
import type { SleepNight } from '../model/sleep';

const RING_THICKNESS_RATIO = 0.1;
const RING_LARGE_PX = 80;
const RING_MEDIUM_PX = 64;

function ringTextOf(size: number): 'title-1' | 'title-2' | 'body-strong' {
  if (size >= RING_LARGE_PX) {
    return 'title-1';
  }
  return size >= RING_MEDIUM_PX ? 'title-2' : 'body-strong';
}

export function SleepScoreRing({
  score,
  size,
}: {
  readonly score: Score;
  readonly size: number;
}): ReactNode {
  const word = scoreWordOf(score.value);
  const box = { width: size, height: size };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Sleep score ${String(score.value)}, ${word}`}
      style={box}
      className="items-center justify-center"
    >
      <View className="absolute inset-0">
        <Arc
          value={score.value / 100}
          size={size}
          thickness={Math.round(size * RING_THICKNESS_RATIO)}
          colour="sleep-deep"
          trackColour="surface-3"
        />
      </View>
      <Text variant={ringTextOf(size)} className="tabular">
        {String(score.value)}
      </Text>
    </View>
  );
}

export function ScoreToggle({
  score,
  size,
  expanded,
  onToggle,
}: {
  readonly score: Score;
  readonly size: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <Interactive
      onPress={onToggle}
      expanded={expanded}
      label={`Sleep score ${String(score.value)}, ${scoreWordOf(score.value)}. How it's scored`}
      hint="Shows what the score is made of."
      role="button"
      className="min-h-touch-min items-center justify-center gap-0.5 rounded-md px-1"
      layerClassName="rounded-md"
    >
      <SleepScoreRing score={score} size={size} />
      <Text variant="body-strong">{scoreWordOf(score.value)}</Text>
      <View className="flex-row items-center gap-0.5">
        <Text variant="caption" tone="primary">
          How it&apos;s scored
        </Text>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} tone="primary" />
      </View>
    </Interactive>
  );
}

function PartRow({ row }: { readonly row: ScorePartRow }): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="body-strong" numberOfLines={1} className="shrink">
          {row.label}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
          {row.detail}
        </Text>
      </View>
      <ProgressBar progress={row.fraction} colour="sleep-deep" label={row.label} />
      <Text variant="caption" tone="variant">
        {row.points}
      </Text>
    </View>
  );
}

export function ScoreParts({
  night,
  score,
}: {
  readonly night: SleepNight;
  readonly score: Score;
}): ReactNode {
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-3">
      {scorePartRowsOf(night, score).map((row) => (
        <PartRow key={row.key} row={row} />
      ))}
    </View>
  );
}
