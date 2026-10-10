import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { HealthEntryRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { notify } from '../../../components/toast-store';
import { errorText } from '../../../format/errors';
import { useEntryWrites } from '../../health-log';
import { MealSections } from '../components/meal-sections';
import { OtherApps } from '../components/other-apps';
import { PortionSheet } from '../components/portion-sheet';
import { SummaryCard } from '../components/summary-card';
import { useDayEntries, useOtherApps, type OtherRecord } from '../data/day-log';
import { useFoods } from '../data/foods';
import { useNutritionPrefRead } from '../data/prefs';
import { useDayTotals, useRecentMetric } from '../data/totals';
import { useAddGlass } from '../data/water';
import { hasAnyGoal } from '../model/macros';
import { editTarget, type PortionTarget } from '../model/target';
import { millilitres } from '../../../format/number';

const RECENT_DAYS = 30;

function FirstRun({ day, today }: { readonly day: string; readonly today: string }): ReactNode {
  const glass = useAddGlass(day, today);
  return (
    <EmptyState
      icon="salad"
      title="Track what you eat and drink"
      body="Log meals and drinks. Calories, macros and water add up for the day."
      action={
        <View className="items-center gap-3">
          <Button label="Add food" icon="plus" size="lg" href={href.logFood({ day })} />
          <View className="flex-row flex-wrap justify-center gap-2">
            {glass.ml === null ? null : (
              <Button
                label={`Glass of water · ${millilitres(glass.ml)}`}
                icon="glassWater"
                variant="tonal"
                onPress={glass.add}
              />
            )}
            <Button
              label="Set goals"
              icon="trophy"
              variant="text"
              href={href.settings.page('health/nutrition')}
            />
          </View>
        </View>
      }
    />
  );
}

export function useNutritionStarted(day: string): boolean {
  const entries = useDayEntries(day).data?.length ?? 0;
  const others = useOtherApps(day).data?.length ?? 0;
  return useStarted(day, entries, others);
}

function useStarted(day: string, entries: number, others: number): boolean {
  const pref = useNutritionPrefRead();
  const food = useRecentMetric(day, RECENT_DAYS, 'energy_in');
  const water = useRecentMetric(day, RECENT_DAYS, 'hydration');
  const goals = pref.status === 'ready' && hasAnyGoal(pref.value);
  return entries > 0 || others > 0 || food || water || goals;
}

function PrefProblem(): ReactNode {
  const pref = useNutritionPrefRead();
  if (pref.status === 'ready') {
    return null;
  }
  return (
    <Banner
      tone="warning"
      title="Your nutrition goals could not be read"
      body="Reset them to start again."
      action={{ label: 'Reset', onPress: pref.reset }}
    />
  );
}

function useEditEntry(open: (target: PortionTarget) => void): (entry: HealthEntryRow) => void {
  const foods = useFoods();
  const writes = useEntryWrites();
  return (entry) => {
    const target = editTarget(
      entry,
      foods.data?.find((food) => food.id === entry.food?.foodId),
    );
    if (target === null) {
      notify({
        message: 'Logged without an amount, so it can only be removed',
        action: { label: 'Remove', onPress: (): void => void writes.remove(entry, 'Food') },
      });
      return;
    }
    open(target);
  };
}

function DayLog({
  day,
  today,
  rows,
  others,
}: {
  readonly day: string;
  readonly today: string;
  readonly rows: readonly HealthEntryRow[];
  readonly others: readonly OtherRecord[];
}): ReactNode {
  const totals = useDayTotals(day);
  const pref = useNutritionPrefRead();
  const [editing, setEditing] = useState<PortionTarget | null>(null);
  const edit = useEditEntry(setEditing);
  return (
    <>
      <PrefProblem />
      <SummaryCard
        totals={totals}
        prefs={pref.status === 'ready' ? pref.value : null}
        day={day}
        today={today}
      />
      <MealSections entries={rows} day={day} onEdit={edit} />
      <OtherApps records={others} counted={rows.length === 0} />
      {editing === null ? null : (
        <PortionSheet
          target={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

export function NutritionDay({
  day,
  today,
}: {
  readonly day: string;
  readonly today: string;
}): ReactNode {
  const entries = useDayEntries(day);
  const others = useOtherApps(day);
  const rows = entries.data ?? [];
  const otherRows = others.data ?? [];
  const started = useStarted(day, rows.length, otherRows.length);
  if (entries.error !== null) {
    return <ErrorState error={entries.error} retry={() => void entries.refetch()} />;
  }
  if (entries.data === undefined) {
    return <Skeleton shape="block" className="h-72" />;
  }
  if (!started) {
    return <FirstRun day={day} today={today} />;
  }
  return (
    <>
      {others.error === null ? null : (
        <Banner
          tone="warning"
          title="Food from other apps could not be loaded"
          body={errorText(others.error).title}
        />
      )}
      <DayLog day={day} today={today} rows={rows} others={otherRows} />
    </>
  );
}
