import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { NutritionDay, useNutritionStarted } from '../../nutrition';
import { FitnessFrame } from '../components/fitness-frame';
import { FitnessToolbar } from '../components/fitness-toolbar';
import { useFitnessParams } from '../data/day';

export function NutritionScreen(): ReactNode {
  const router = useRouter();
  const { day, today } = useFitnessParams('day');
  const started = useNutritionStarted(day);
  return (
    <FitnessFrame
      tab="nutrition"
      width="detail"
      toolbar={<FitnessToolbar day={day} today={today} range="day" />}
      primaryAction={
        started
          ? {
              label: 'Add food',
              icon: 'plus',
              onPress: (): void => {
                router.push(href.logFood({ day }));
              },
            }
          : undefined
      }
    >
      <NutritionDay day={day} today={today} started={started} />
    </FitnessFrame>
  );
}
