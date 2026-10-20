import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Hypnogram } from '../../../components/charts';
import { STAGE_COLOURS, type HypnogramStage } from '../../../components/charts/hypnogram-model';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { hoursMinutes } from '../../../format/time';
import { sleepScore } from '../model/scores';
import { timelineOf, type SleepNight } from '../model/sleep';
import {
  NO_STAGES_NOTE,
  goalFiguresOf,
  legendRowsOf,
  timesLineOf,
  type NapFace,
} from '../model/sleep-widget';
import { SleepScoreRing } from '../components/sleep-score-ring';

export type FigureScale = 's' | 'm';

function Swatch({ stage }: { readonly stage: HypnogramStage }): ReactNode {
  const fill = { backgroundColor: useColour(STAGE_COLOURS[stage]) };
  return <View style={fill} className="size-2.5 rounded-xs" />;
}

export function Ring({
  night,
  goalMinutes,
  size,
}: {
  readonly night: SleepNight;
  readonly goalMinutes: number;
  readonly size: number;
}): ReactNode {
  const score = sleepScore(night, goalMinutes);
  return score === null ? null : <SleepScoreRing score={score} size={size} />;
}

export function Headline({
  night,
  scale,
}: {
  readonly night: SleepNight;
  readonly scale: FigureScale;
}): ReactNode {
  return (
    <View className="min-w-0 shrink">
      <Figure value={hoursMinutes(night.asleepMinutes)} size={scale} />
      <Text variant="caption" tone="variant">
        asleep
      </Text>
    </View>
  );
}

export function Goal({
  night,
  goalMinutes,
  long,
}: {
  readonly night: SleepNight;
  readonly goalMinutes: number;
  readonly long: boolean;
}): ReactNode {
  const goal = goalFiguresOf(night, goalMinutes);
  return (
    <View className="flex-row items-center gap-2">
      <View className="min-w-0 flex-1">
        <ProgressBar progress={goal.progress} colour="sleep-deep" label="Sleep goal" />
      </View>
      <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
        {long ? goal.long : goal.short}
      </Text>
    </View>
  );
}

export function TimesLine({ night }: { readonly night: SleepNight }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
      {timesLineOf(night)}
    </Text>
  );
}

export function NightChart({
  night,
  height,
}: {
  readonly night: SleepNight;
  readonly height?: number;
}): ReactNode {
  return (
    <Hypnogram
      segments={timelineOf(night)}
      label="Sleep stages"
      compact
      {...(height === undefined ? {} : { height })}
      from={night.bedtime}
      to={night.wake}
    />
  );
}

export function GhostChart(): ReactNode {
  return <Hypnogram segments={[]} label="Sleep stages" compact height={28} />;
}

export function LegendRow({ night }: { readonly night: SleepNight }): ReactNode {
  if (!night.hasStages) {
    return (
      <Text variant="footnote" tone="variant">
        {NO_STAGES_NOTE}
      </Text>
    );
  }
  return (
    <View aria-hidden className="flex-row flex-wrap gap-x-4 gap-y-1">
      {legendRowsOf(night).map((row) => (
        <View key={row.stage} className="flex-row items-center gap-1.5">
          <Swatch stage={row.stage} />
          <Text variant="footnote" tone="variant">
            {row.label}
          </Text>
          <Text variant="footnote" className="tabular font-sans-medium">
            {row.minutes}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LegendColumn({ night }: { readonly night: SleepNight }): ReactNode {
  if (!night.hasStages) {
    return (
      <Text variant="footnote" tone="variant">
        {NO_STAGES_NOTE}
      </Text>
    );
  }
  return (
    <View aria-hidden className="gap-1">
      {legendRowsOf(night).map((row) => (
        <View key={row.stage} className="flex-row items-center gap-2">
          <Swatch stage={row.stage} />
          <Text variant="footnote" tone="variant" className="flex-1" numberOfLines={1}>
            {row.label}
          </Text>
          <Text variant="footnote" className="tabular font-sans-medium" numberOfLines={1}>
            {`${row.minutes} · ${row.percent}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function NapPiece({
  stage,
  share,
}: {
  readonly stage: HypnogramStage;
  readonly share: number;
}): ReactNode {
  const fill = {
    flexGrow: share,
    flexBasis: 0,
    backgroundColor: useColour(STAGE_COLOURS[stage]),
  };
  return <View style={fill} className="h-5 min-w-1 rounded-xs" />;
}

export function NapBar({ face }: { readonly face: NapFace }): ReactNode {
  return (
    <View aria-hidden className="gap-1">
      <View className="h-5 w-full flex-row gap-0.5">
        {face.pieces.map((piece, index) => (
          <NapPiece key={`${piece.stage}-${String(index)}`} {...piece} />
        ))}
      </View>
      <View className="flex-row justify-between">
        <Text variant="caption" className="tabular">
          {face.start}
        </Text>
        <Text variant="caption" className="tabular">
          {face.end}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-0.5">
        {face.legend.map((entry) => (
          <View key={entry.stage} className="flex-row items-center gap-1.5">
            <Swatch stage={entry.stage} />
            <Text variant="footnote" tone="variant">
              {entry.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
