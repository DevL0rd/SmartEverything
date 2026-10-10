import type { ReactNode } from 'react';
import { MEALS, type HealthEntryRow } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { href } from '../../../app-shell/hrefs';
import { amountText } from '../model/macros';
import { MEAL_INFO, mealOfCode, type Meal } from '../model/meals';
import { nutritionOf, waterMlOfEntry } from '../model/portion';
import { FoodEntryRow, WaterEntryRow } from './entry-rows';

function mealOf(entry: HealthEntryRow): Meal {
  const data = nutritionOf(entry);
  return (data === null ? null : mealOfCode(data.mealType)) ?? 'snack';
}

function kcalOf(entries: readonly HealthEntryRow[]): number {
  return entries.reduce((total, entry) => total + (nutritionOf(entry)?.kilocalories ?? 0), 0);
}

function MealSection({
  meal,
  entries,
  day,
  onEdit,
}: {
  readonly meal: Meal;
  readonly entries: readonly HealthEntryRow[];
  readonly day: string;
  readonly onEdit: (entry: HealthEntryRow) => void;
}): ReactNode {
  const info = MEAL_INFO[meal];
  const title =
    entries.length === 0
      ? info.label
      : `${info.label} · ${amountText(kcalOf(entries), 'kcal')} kcal`;
  return (
    <List title={title} inset>
      {entries.map((entry) => (
        <FoodEntryRow key={entry.id} entry={entry} onEdit={onEdit} />
      ))}
      <ListRow
        icon={entries.length === 0 ? info.icon : 'plus'}
        iconTone="primary"
        title={`Add to ${info.label}`}
        href={href.logFood({ meal, day })}
      />
    </List>
  );
}

export function MealSections({
  entries,
  day,
  onEdit,
}: {
  readonly entries: readonly HealthEntryRow[];
  readonly day: string;
  readonly onEdit: (entry: HealthEntryRow) => void;
}): ReactNode {
  const foods = entries.filter((entry) => entry.record_type === 'Nutrition');
  const water = entries.filter(
    (entry) => entry.record_type === 'Hydration' && waterMlOfEntry(entry) > 0,
  );
  return (
    <>
      {MEALS.map((meal) => (
        <MealSection
          key={meal}
          meal={meal}
          entries={foods.filter((entry) => mealOf(entry) === meal)}
          day={day}
          onEdit={onEdit}
        />
      ))}
      {water.length === 0 ? null : (
        <List title="Water" inset>
          {water.map((entry) => (
            <WaterEntryRow key={entry.id} entry={entry} />
          ))}
        </List>
      )}
    </>
  );
}
