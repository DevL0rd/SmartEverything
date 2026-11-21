import type { PlannerStats, PlannerStatsRange } from '@smarteverything/domain';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { Bars, CalendarHeatmap } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { usePlannerItems, usePlannerOccurrences } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { streakWordsOf } from '../tasks/habits';
import { habitViewsOf, type HabitView } from './habit-model';
import { BAR_DAYS_MAX, habitBarsOf, heatSplitOf, rangeDaysOf } from './insights-model';

function HabitHead({
  habit,
  range,
}: {
  readonly habit: HabitView;
  readonly range: PlannerStatsRange;
}): ReactNode {
  const { item, streak, done } = habit;
  return (
    <View className="flex-row items-center gap-3">
      <Icon name={item.completion.kind === 'signal' ? 'zap' : 'repeat'} size={18} tone="variant" />
      <Interactive
        href={href.planner.item(item.id, null)}
        label={item.title}
        className="min-h-touch-min min-w-0 flex-1 justify-center rounded-sm"
        layerClassName="rounded-sm"
      >
        <Text variant="footnote" numberOfLines={1}>
          {item.title}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {`${String(done)} done this ${range}`}
        </Text>
      </Interactive>
      <View
        accessible
        accessibilityLabel={streakWordsOf(streak)}
        className="flex-row items-center gap-1"
      >
        <Icon name="flame" size={16} tone={streak.current === 0 ? 'faint' : 'primary'} />
        <Text variant="label" className="tabular">
          {`${String(streak.current)} in a row`}
        </Text>
      </View>
    </View>
  );
}

interface LineProps {
  readonly habit: HabitView;
  readonly today: string;
  readonly range: PlannerStatsRange;
}

function HabitChart({ habit, today, range }: LineProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const label = `${habit.item.title} done`;
  const days = range === 'year' ? habit.heat.filter((day) => day.covered) : habit.heat;
  if (days.length <= BAR_DAYS_MAX) {
    return (
      <Bars
        bars={habitBarsOf(days)}
        colour="primary"
        label={label}
        height={20}
        highlightKey={today}
        peakLabel={false}
      />
    );
  }
  return (
    <View onLayout={onLayout}>
      {width === 0 ? null : (
        <CalendarHeatmap
          days={days}
          today={today}
          label={label}
          unit="done"
          split={heatSplitOf(days.length, width)}
        />
      )}
    </View>
  );
}

const HabitLine = memo(function HabitLine(props: LineProps): ReactNode {
  return (
    <View className="gap-2">
      <HabitHead habit={props.habit} range={props.range} />
      <HabitChart {...props} />
    </View>
  );
});

export function HabitSummary({ stats }: { readonly stats: PlannerStats }): ReactNode {
  const { person } = usePlannerFrame();
  const today = useMinuteOf(dayKeyOf);
  const plannerItems = usePlannerItems(person);
  const plannerOccurrences = usePlannerOccurrences(person);
  const habits = habitViewsOf(plannerItems, plannerOccurrences, rangeDaysOf(stats));
  return (
    <Card title="Habits" icon="flame" className="grow">
      {habits.length === 0 ? (
        <Text variant="footnote" tone="variant">
          Tasks that repeat show up here with their streak.
        </Text>
      ) : (
        <View className="gap-4">
          {habits.map((habit) => (
            <HabitLine key={habit.item.id} habit={habit} today={today} range={stats.range} />
          ))}
        </View>
      )}
    </Card>
  );
}
