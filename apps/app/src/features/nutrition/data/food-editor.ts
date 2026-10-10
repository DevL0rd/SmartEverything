import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { FoodRow, NewFood } from '@smarteverything/domain';
import { changeFood, forgetFood, saveFood } from '../../../api/nutrition';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { FOODS_KEY } from '../../../queries/health-entries';
import { changeOf } from '../model/food-form';

export function useFoodSave(
  food: FoodRow | null,
  done: () => void,
): { readonly busy: boolean; readonly save: (checked: NewFood) => void } {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = (checked: NewFood): void => {
    setBusy(true);
    const work = food === null ? saveFood(checked) : changeFood(food.id, changeOf(checked));
    work.then(
      () => {
        setBusy(false);
        void client.invalidateQueries({ queryKey: FOODS_KEY });
        notify({ message: `${checked.name} saved`, tone: 'positive' });
        done();
      },
      (error: unknown) => {
        setBusy(false);
        notify({ message: `${checked.name} was not saved`, error, tone: 'critical' });
      },
    );
  };
  return { busy, save };
}

export function useForgetFood(food: FoodRow | null): () => void {
  const router = useRouter();
  const client = useQueryClient();
  const forget = async (row: FoodRow): Promise<void> => {
    const sure = await confirm({
      title: `Forget ${row.name}?`,
      body: 'What you already logged stays.',
      confirmLabel: 'Forget',
      tone: 'destructive',
    });
    if (!sure) {
      return;
    }
    try {
      await forgetFood(row.id);
      void client.invalidateQueries({ queryKey: FOODS_KEY });
      router.back();
    } catch (error) {
      notify({ message: `${row.name} was not forgotten`, error, tone: 'critical' });
    }
  };
  return (): void => {
    if (food !== null) {
      void forget(food);
    }
  };
}
