import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { ProgressBar, StageTimeline } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { rowLayoutOf, type RowLayout } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { clock, hoursMinutes } from '../../../format/time';
import { useLastNight } from '../data/nights';
import { useTodayContext } from '../data/today';
import { STAGE_LABELS, timelineOf, type SleepNight, type StageKind } from '../model/sleep';

const SHOWN_STAGES: readonly StageKind[] = ['deep', 'light', 'rem', 'awake'];

const STAGE_DOT: Readonly<Partial<Record<StageKind, string>>> = {
  deep: 'bg-sleep-deep',
  light: 'bg-sleep-core',
  rem: 'bg-sleep-rem',
  awake: 'bg-sleep-awake',
};

function Summary({
  night,
  goal,
  big,
}: {
  readonly night: SleepNight;
  readonly goal: number;
  readonly big: boolean;
}): ReactNode {
  return (
    <View className="gap-1.5">
      <Figure value={hoursMinutes(night.asleepMinutes)} size={big ? 'l' : 'm'} />
      <ProgressBar progress={night.asleepMinutes / goal} colour="sleep-core" label="Sleep goal" />
      <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
        {big
          ? `${clock(night.bedtime)} – ${clock(night.wake)} · goal ${hoursMinutes(goal)}`
          : `Goal ${hoursMinutes(goal)}`}
      </Text>
    </View>
  );
}

function Stages({ night }: { readonly night: SleepNight }): ReactNode {
  return (
    <View className="gap-1.5">
      {SHOWN_STAGES.map((kind) => (
        <View key={kind} className="flex-row items-center gap-2">
          <View className={cn('size-2.5 rounded-full', STAGE_DOT[kind])} />
          <Text variant="footnote" tone="variant" className="flex-1" numberOfLines={1}>
            {STAGE_LABELS[kind]}
          </Text>
          <Text variant="footnote" className="tabular" numberOfLines={1}>
            {hoursMinutes(night.totals[kind])}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Body({
  night,
  goal,
  layout,
}: {
  readonly night: SleepNight;
  readonly goal: number;
  readonly layout: RowLayout;
}): ReactNode {
  if (layout === 'tile') {
    return <Summary night={night} goal={goal} big={false} />;
  }
  const wide = layout === 'wide';
  return (
    <View className="flex-1 flex-row items-center gap-5">
      <View className={wide ? 'w-1/3' : 'w-2/5'}>
        <Summary night={night} goal={goal} big={wide} />
      </View>
      <View className="min-w-0 flex-1">
        <StageTimeline segments={timelineOf(night)} label="Sleep stages" compact />
      </View>
      {wide && night.hasStages ? (
        <View className="w-1/5">
          <Stages night={night} />
        </View>
      ) : null}
    </View>
  );
}

export function SleepWidget(): ReactNode {
  const { day, goals } = useTodayContext();
  const { night } = useLastNight(day);
  const { cls } = useWidgetFace();
  return (
    <WidgetFrame
      title="Sleep"
      icon="moon"
      accent="sleep-core"
      href={href.fitnessPage('sleep', { day })}
    >
      {night === null ? (
        <WidgetEmpty
          icon="moon"
          colour="sleep-core"
          title="No sleep recorded"
          body="Wear your watch to bed to see last night here."
        />
      ) : (
        <Body night={night} goal={goals.sleep_minutes} layout={rowLayoutOf(cls)} />
      )}
    </WidgetFrame>
  );
}
