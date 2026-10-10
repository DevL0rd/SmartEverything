import { useQueryClient } from '@tanstack/react-query';
import { saveFood } from '../../../api/nutrition';
import { notify } from '../../../components/toast-store';
import { FOODS_KEY } from '../../../queries/health-entries';
import { useEntryWrites } from '../../health-log';
import { MEAL_INFO, type Meal } from '../model/meals';
import { entryOfFood } from '../model/portion';
import type { PortionTarget } from '../model/target';

export interface PortionChoice {
  readonly amount: number;
  readonly multiplier: number;
  readonly meal: Meal;
  readonly at: number;
}

async function foodIdOf(target: PortionTarget): Promise<string | null> {
  if (target.saveAs === null) {
    return target.foodId;
  }
  return (await saveFood(target.saveAs)).id;
}

export function useLogFood(): {
  readonly save: (target: PortionTarget, choice: PortionChoice) => Promise<boolean>;
  readonly remove: (target: PortionTarget) => Promise<boolean>;
} {
  const writes = useEntryWrites();
  const client = useQueryClient();
  return {
    save: async (target, choice): Promise<boolean> => {
      let foodId: string | null;
      try {
        foodId = await foodIdOf(target);
      } catch (error) {
        notify({ message: `${target.food.name} was not saved`, error, tone: 'critical' });
        return false;
      }
      void client.invalidateQueries({ queryKey: FOODS_KEY });
      const input = entryOfFood({ food: target.food, foodId, ...choice });
      if (target.entry !== null) {
        return writes.update(target.entry, input);
      }
      const saved = await writes.create(input, `Added to ${MEAL_INFO[choice.meal].label}`);
      return saved !== null;
    },
    remove: async (target): Promise<boolean> =>
      target.entry === null ? false : writes.remove(target.entry, target.food.name),
  };
}
