import { Logger, background } from '@smarteverything/logging';
import { useQueryClient } from '@tanstack/react-query';
import { saveFood } from '../../../api/nutrition';
import { notify } from '../../../components/toast-store';
import { FOODS_KEY } from '../../../queries/health-entries';
import { useEntryWrites } from '../../health-log';
import { MEAL_INFO, type Meal } from '../model/meals';
import { entryOfFood } from '../model/portion';
import type { PortionTarget } from '../model/target';

const log = new Logger('app.nutrition');
export interface PortionChoice {
  readonly amount: number;
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
      const startedAt = Date.now();
      log.debug('food.log_started', {
        meal: choice.meal,
        saveFood: target.saveAs !== null,
        editing: target.entry !== null,
      });
      try {
        foodId = await foodIdOf(target);
      } catch (error) {
        log.error('food.save_failed', error, { durationMs: Date.now() - startedAt });
        notify({ message: `${target.food.name} was not saved`, error, tone: 'critical' });
        return false;
      }
      background(client.invalidateQueries({ queryKey: FOODS_KEY }), 'queries.invalidate_failed');
      const input = entryOfFood({ food: target.food, foodId, ...choice });
      if (target.entry !== null) {
        const updated = await writes.update(target.entry, input);
        log.info('food.entry_updated', { updated, durationMs: Date.now() - startedAt });
        return updated;
      }
      const saved = await writes.create(input, `Added to ${MEAL_INFO[choice.meal].label}`);
      log.info('food.entry_created', {
        saved: saved !== null,
        meal: choice.meal,
        durationMs: Date.now() - startedAt,
      });
      return saved !== null;
    },
    remove: async (target): Promise<boolean> => {
      if (target.entry === null) return false;
      const removed = await writes.remove(target.entry, target.food.name);
      log.info('food.entry_removed', { removed });
      return removed;
    },
  };
}
