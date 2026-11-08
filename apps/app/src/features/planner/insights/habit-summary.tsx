import type { PlannerStats } from '@smarteverything/domain';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { Bars, CalendarHeatmap } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { rounded } from '../../../format/number';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { usePlannerItems, usePlannerOccurrences } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { streakWordsOf } from '../tasks/habits';
import { habitViewsOf, type HabitView } from './habit-model';
import { dayBarsOf, heatSplitOf, rangeDaysOf } from './insights-model';

function HabitHead({ habit }: { readonly habit: HabitView }): ReactNode {
  const { item, streak, done } = habit;
  return (
    <View className="flex-row items-center gap-3">
      <Icon name={item.completion.kind === 'signal' ? 'zap' : 'repeat'} size={18} tone="variant" />
      <Interactive
        href={href.planner.item(item.id)}
        label={item.title}
        className="min-w-0 flex-1 rounded-sm"
        layerClassName="rounded-sm"
      >
        <Text variant="footnote" numberOfLines={1}>
          {item.title}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {`${String(done)} done`}
        </Text>
      </Interactive>
      <View
        accessible
        accessibilityLabel={streakWordsOf(streak)}
        className="flex-row items-center gap-1"
      >
        <Icon name="flame" size={16} tone={streak.current === 0 ? 'faint' : 'primary'} />
        <Text variant="label" className="tabular">
          {String(streak.current)}
        </Text>
      </View>
    </View>
  );
}

interface LineProps {
  readonly habit: HabitView;
  readonly today: string;
  readonly week: boolean;
}

function HabitChart({ habit, today, week }: LineProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const label = `${habit.item.title} done`;
  if (week) {
    return (
      <Bars
        bars={dayBarsOf(habit.heat)}
        colour="primary"
        label={label}
        height={20}
        highlightKey={today}
        formatValue={(value) => `${rounded(value, 0)} a day`}
      />
    );
  }
  return (
    <View onLayout={onLayout}>
      {width === 0 ? null : (
        <CalendarHeatmap
          days={habit.heat}
          today={today}
          label={label}
          unit="done"
          split={heatSplitOf(habit.heat.length, width)}
        />
      )}
    </View>
  );
}

const HabitLine = memo(function HabitLine(props: LineProps): ReactNode {
  return (
    <View className="gap-2">
      <HabitHead habit={props.habit} />
      <HabitChart {...props} />
    </View>
  );
});

export function HabitSummary({ stats }: { readonly stats: PlannerStats }): ReactNode {
  const { person } = usePlannerFrame();
  const today = useMinuteOf(dayKeyOf);
  const habits = habitViewsOf(
    usePlannerItems(person),
    usePlannerOccurrences(person),
    rangeDaysOf(stats),
  );
  return (
    <Card title="Habits" icon="flame">
      {habits.length === 0 ? (
        <Text variant="footnote" tone="variant">
          Tasks that repeat show up here with their streak.
        </Text>
      ) : (
        <View className="gap-4">
          {habits.map((habit) => (
            <HabitLine
              key={habit.item.id}
              habit={habit}
              today={today}
              week={stats.range === 'week'}
            />
          ))}
        </View>
      )}
    </Card>
  );
}
