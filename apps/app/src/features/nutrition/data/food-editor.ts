import { Logger, background } from '@smarteverything/logging';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FoodRow, NewFood } from '@smarteverything/domain';
import { changeFood, forgetFood, saveFood } from '../../../api/nutrition';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { FOODS_KEY } from '../../../queries/health-entries';
import { changeOf } from '../model/food-form';

const log = new Logger('app.nutrition');

export function useFoodSave(
  food: FoodRow | null,
  done: () => void,
): { readonly busy: boolean; readonly save: (checked: NewFood) => void } {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (checked: NewFood) =>
      food === null ? saveFood(checked) : changeFood(food.id, changeOf(checked)),
    onSuccess: (_saved, checked): void => {
      log.info('food.saved', { created: food === null });
      background(client.invalidateQueries({ queryKey: FOODS_KEY }), 'queries.invalidate_failed');
      notify({ message: `${checked.name} saved`, tone: 'positive' });
      done();
    },
    onError: (error, checked): void => {
      log.error('food.save_failed', error, { created: food === null });
      notify({ message: `${checked.name} was not saved`, error, tone: 'critical' });
    },
  });
  return { busy: mutation.isPending, save: mutation.mutate };
}

export function useForgetFood(food: FoodRow | null): () => void {
  const router = useRouter();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (row: FoodRow): Promise<void> => {
      const sure = await confirm({
        title: `Forget ${row.name}?`,
        body: 'What you already logged stays.',
        confirmLabel: 'Forget',
        tone: 'destructive',
      });
      if (sure) {
        await forgetFood(row.id);
        log.info('food.forgotten', { foodId: row.id });
        background(client.invalidateQueries({ queryKey: FOODS_KEY }), 'queries.invalidate_failed');
        router.back();
      }
    },
    onError: (error, row): void => {
      log.error('food.forget_failed', error, { foodId: row.id });
      notify({ message: `${row.name} was not forgotten`, error, tone: 'critical' });
    },
  });
  return (): void => {
    if (food !== null) {
      mutation.mutate(food);
    }
  };
}
