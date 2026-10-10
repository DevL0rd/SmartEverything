import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DayAxis, FillChart, ProgressBar, type FillValue } from '../../components/charts';
import { Figure, type FigureSize } from '../../components/figure';
import { Text } from '../../components/text';
import { count, percent } from '../../format/number';
import { shiftDay } from '../../format/time';
import type { Device, StoreState } from '../../store/state';
import { useStoreSelector } from '../../store/store-context';
import type { WatchGlance } from './watch-glance';

function stepsLine(glance: WatchGlance): string {
  const steps = glance.steps;
  if (steps === null) {
    return `No steps yet today · goal ${count(glance.stepsGoal)}`;
  }
  const left = glance.stepsGoal - steps.value;
  if (left <= 0) {
    return `Goal of ${count(glance.stepsGoal)} reached`;
  }
  return `${percent(steps.value / glance.stepsGoal)} of ${count(glance.stepsGoal)} · ${count(left)} to go`;
}

export function StepsBlock({
  glance,
  size,
}: {
  readonly glance: WatchGlance;
  readonly size: FigureSize;
}): ReactNode {
  const steps = glance.steps;
  return (
    <View className="gap-1.5">
      <Figure value={steps === null ? '0' : count(steps.value)} unit="steps" size={size} />
      <ProgressBar
        progress={steps === null ? 0 : steps.value / glance.stepsGoal}
        colour="stand"
        label="Steps goal"
        thick={size === 'xl'}
      />
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {stepsLine(glance)}
      </Text>
    </View>
  );
}

const WEEK = 7;

function weekOf(
  state: StoreState,
  today: string,
  profileId: string | null,
): readonly (number | null)[] {
  const days = Array.from({ length: WEEK }, (_, index) => shiftDay(today, index - WEEK + 1));
  const found = new Map<string, number>();
  for (const id of state.tables.health_daily.ids) {
    const row = state.tables.health_daily.byId[id];
    if (row?.metric === 'steps' && (profileId === null || row.profile_id === profileId)) {
      found.set(row.day, row.value);
    }
  }
  return days.map((day) => found.get(day) ?? null);
}

function sameWeek(left: readonly (number | null)[], right: readonly (number | null)[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function WeekSteps({
  watch,
  glance,
}: {
  readonly watch: Device;
  readonly glance: WatchGlance;
}): ReactNode {
  const profile = watch.details['profileId'];
  const week = useStoreSelector(
    (state) => weekOf(state, glance.today, typeof profile === 'string' ? profile : null),
    sameWeek,
  );
  const values: readonly FillValue[] = week.map((value, index) => ({
    key: shiftDay(glance.today, index - WEEK + 1),
    value: index === WEEK - 1 ? (glance.steps?.value ?? value) : value,
  }));
  return (
    <View className="flex-1 gap-1">
      <FillChart
        values={values}
        kind="bars"
        colour="stand"
        reference={glance.stepsGoal}
        label="Steps, last 7 days"
      />
      <DayAxis days={values.map((item) => item.key)} />
    </View>
  );
}
