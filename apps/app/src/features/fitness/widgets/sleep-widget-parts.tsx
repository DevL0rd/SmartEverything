import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Hypnogram } from '../../../components/charts';
import { STAGE_COLOURS, type HypnogramStage } from '../../../components/charts/hypnogram-model';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { WidgetFrameBox } from '../../../components/widget-board/frame-class';
import { widgetBodyHeight } from '../../../components/widget-board/widget-frame-metrics';
import { TYPE_SCALE } from '../../../design/tokens';
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

const LINE_GAP = 2;

export interface NightFit {
  readonly ring: number;
  readonly scale: FigureScale;
}

function headlineHeight(frame: WidgetFrameBox, scale: FigureScale): number {
  const type = TYPE_SCALE[frame.idiom];
  return type[scale === 'm' ? 'figure-m' : 'figure-s'][1] + type.caption[1];
}

export function rowFitOf(frame: WidgetFrameBox): NightFit {
  return { ring: headlineHeight(frame, 's'), scale: 's' };
}

export function columnFitOf(frame: WidgetFrameBox): NightFit {
  const lines = 2 * (TYPE_SCALE[frame.idiom].footnote[1] + LINE_GAP);
  const ring = Math.floor(widgetBodyHeight(frame) - lines);
  return { ring, scale: headlineHeight(frame, 'm') <= ring ? 'm' : 's' };
}

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

function FillHeight({ children }: { readonly children: (height: number) => ReactNode }): ReactNode {
  const [height, setHeight] = useState(0);
  return (
    <View
      className="min-h-0 w-full flex-1"
      onLayout={(event) => {
        setHeight(Math.floor(event.nativeEvent.layout.height));
      }}
    >
      {height > 0 ? children(height) : null}
    </View>
  );
}

export function NightChart({ night }: { readonly night: SleepNight }): ReactNode {
  return (
    <FillHeight>
      {(height) => (
        <Hypnogram
          segments={timelineOf(night)}
          label="Sleep stages"
          compact
          height={height}
          from={night.bedtime}
          to={night.wake}
        />
      )}
    </FillHeight>
  );
}

export function GhostChart(): ReactNode {
  return (
    <FillHeight>
      {(height) => <Hypnogram segments={[]} label="Sleep stages" compact height={height} />}
    </FillHeight>
  );
}

function LegendEntry({
  row,
}: {
  readonly row: ReturnType<typeof legendRowsOf>[number];
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <Swatch stage={row.stage} />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {row.label}
      </Text>
      <Text variant="footnote" className="tabular font-sans-medium" numberOfLines={1}>
        {row.minutes}
      </Text>
    </View>
  );
}

export function LegendGrid({ night }: { readonly night: SleepNight }): ReactNode {
  if (!night.hasStages) {
    return (
      <Text variant="footnote" tone="variant">
        {NO_STAGES_NOTE}
      </Text>
    );
  }
  const rows = legendRowsOf(night);
  const half = Math.ceil(rows.length / 2);
  return (
    <View aria-hidden className="flex-row gap-3">
      {[rows.slice(0, half), rows.slice(half)].map((column) => (
        <View key={column.map((row) => row.stage).join()} className="gap-0.5">
          {column.map((row) => (
            <LegendEntry key={row.stage} row={row} />
          ))}
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
    <View aria-hidden className="gap-0.5">
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
    <View aria-hidden className="gap-0.5">
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
