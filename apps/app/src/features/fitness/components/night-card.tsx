import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Hypnogram } from '../../../components/charts';
import { ProgressBar } from '../../../components/charts/progress-bar';
import { Figure } from '../../../components/figure';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { hoursMinutes } from '../../../format/time';
import { useGoals } from '../data/goals';
import { useLastNight } from '../data/nights';
import {
  goalLine,
  goalPercentOf,
  inBedParts,
  napOnlyLine,
  nightDateLabel,
} from '../model/night-card';
import { sleepScore, type Score } from '../model/scores';
import { timelineOf, type SleepNight } from '../model/sleep';
import { stageRowsOf } from '../model/sleep-summary';
import { NapChip, NapSection, useNapReveal } from './nap-strip';
import { NightVitals } from './night-vitals';
import { ScoreParts, ScoreToggle } from './sleep-score-ring';
import { SleepEmpty } from './sleep-empty';
import { StageLegend, StageSummary } from './stage-summary';

const RING_PHONE_PX = 64;
const RING_DESKTOP_PX = 88;
const NO_STAGES_CAPTION = "Your tracker didn't record stages for this night.";

function InBedLine({ night }: { readonly night: SleepNight }): ReactNode {
  const { times, duration } = inBedParts(night);
  return (
    <View className="flex-row flex-wrap gap-x-3">
      <Text variant="footnote" tone="variant" className="tabular">
        {times}
      </Text>
      <Text variant="footnote" tone="variant" className="tabular">
        {duration}
      </Text>
    </View>
  );
}

function DateLabel({ night }: { readonly night: SleepNight }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="tabular">
      {nightDateLabel(night)}
    </Text>
  );
}

function Headline({
  night,
  goalMinutes,
  durationOnly,
}: {
  readonly night: SleepNight;
  readonly goalMinutes: number;
  readonly durationOnly: boolean;
}): ReactNode {
  const { split } = useSizeClass();
  const percent = goalPercentOf(night.asleepMinutes, goalMinutes);
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <Figure value={hoursMinutes(night.asleepMinutes)} unit="asleep" size={split ? 'xl' : 'l'} />
      <InBedLine night={night} />
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <ProgressBar progress={percent / 100} colour="sleep-deep" label="Sleep goal" />
        </View>
        <Text variant="footnote" tone="variant" className="tabular">
          {goalLine(goalMinutes, percent)}
        </Text>
      </View>
      {durationOnly ? (
        <Text variant="footnote" tone="variant">
          Based on duration only
        </Text>
      ) : null}
    </View>
  );
}

function Header({
  night,
  score,
  goalMinutes,
  expanded,
  onToggle,
}: {
  readonly night: SleepNight;
  readonly score: Score | null;
  readonly goalMinutes: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const { split } = useSizeClass();
  return (
    <View className="flex-row items-start gap-4">
      {score === null ? null : (
        <ScoreToggle
          score={score}
          size={split ? RING_DESKTOP_PX : RING_PHONE_PX}
          expanded={expanded}
          onToggle={onToggle}
        />
      )}
      <Headline
        night={night}
        goalMinutes={goalMinutes}
        durationOnly={score !== null && !night.hasStages}
      />
    </View>
  );
}

function Naps({
  naps,
  reveal,
}: {
  readonly naps: readonly SleepNight[];
  readonly reveal: () => void;
}): ReactNode {
  return naps.length === 0 ? null : (
    <View className="flex-row flex-wrap gap-2">
      {naps.map((nap) => (
        <NapChip key={nap.recordId} nap={nap} onPress={reveal} />
      ))}
    </View>
  );
}

function StageChart({
  night,
  quiet,
  at,
  onAt,
}: {
  readonly night: SleepNight;
  readonly quiet: boolean;
  readonly at: number | null;
  readonly onAt: (at: number | null) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      {quiet && night.hasStages ? <StageLegend /> : null}
      <Hypnogram
        segments={timelineOf(night)}
        label="Sleep stages"
        from={night.bedtime}
        to={night.wake}
        at={at}
        onAt={onAt}
      />
      {night.hasStages ? null : (
        <Text variant="footnote" tone="variant">
          {NO_STAGES_CAPTION}
        </Text>
      )}
    </View>
  );
}

interface BodyProps {
  readonly night: SleepNight;
  readonly naps: readonly SleepNight[];
  readonly goalMinutes: number;
  readonly quiet: boolean;
}

function NightBody({ night, naps, goalMinutes, quiet }: BodyProps): ReactNode {
  const { split } = useSizeClass();
  const [at, setAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const nap = useNapReveal();
  const score = sleepScore(night, goalMinutes);
  const header = (
    <Header
      night={night}
      score={score}
      goalMinutes={goalMinutes}
      expanded={expanded}
      onToggle={() => {
        setExpanded(!expanded);
      }}
    />
  );
  const parts = expanded && score !== null ? <ScoreParts night={night} score={score} /> : null;
  const summary = (
    <View className="gap-3">
      <StageSummary rows={stageRowsOf(night)} />
      <Naps naps={naps} reveal={nap.reveal} />
    </View>
  );
  const chart = <StageChart night={night} quiet={quiet} at={at} onAt={setAt} />;
  return (
    <Card title="Last night" icon="moon" action={<DateLabel night={night} />}>
      {split ? (
        <View className="flex-row gap-6">
          <View className="min-w-0 flex-5 gap-3">
            {header}
            {parts}
          </View>
          <View className="min-w-0 flex-3">{summary}</View>
        </View>
      ) : (
        <>
          {header}
          {parts}
        </>
      )}
      {chart}
      {split ? null : summary}
      {quiet ? null : <NightVitals night={night} at={at} onAt={setAt} />}
      <NapSection naps={naps} target={nap.ref} />
    </Card>
  );
}

function NapOnlyCard({
  day,
  naps,
}: {
  readonly day: string;
  readonly naps: readonly SleepNight[];
}): ReactNode {
  const nap = useNapReveal();
  const first = naps[0];
  return (
    <Card
      title="Nap"
      icon="moon"
      action={
        first === undefined ? null : (
          <Text variant="footnote" tone="variant" className="tabular">
            {nightDateLabel(first)}
          </Text>
        )
      }
    >
      <Text variant="callout" tone="variant">
        {napOnlyLine(day)}
      </Text>
      <NapSection naps={naps} target={nap.ref} />
    </Card>
  );
}

export function NightCard({
  day,
  quiet,
}: {
  readonly day: string;
  readonly quiet: boolean;
}): ReactNode {
  const { night, naps, loaded } = useLastNight(day);
  const goals = useGoals();
  if (!loaded) {
    return <Skeleton shape="block" className="h-96" />;
  }
  if (night !== null) {
    return <NightBody night={night} naps={naps} goalMinutes={goals.sleep_minutes} quiet={quiet} />;
  }
  if (naps.length > 0) {
    return <NapOnlyCard day={day} naps={naps} />;
  }
  return quiet ? null : <SleepEmpty day={day} />;
}
