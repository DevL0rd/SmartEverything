import { useMinute } from '../../../store/clock';
import { useEntryWrites } from '../../health-log';
import { momentOn } from '../model/day';
import { waterEntry } from '../model/portion';
import { useNutritionPrefs } from './prefs';

export function useAddGlass(
  day: string,
  today: string,
): { readonly ml: number | null; readonly add: () => void } {
  const prefs = useNutritionPrefs();
  const now = useMinute();
  const writes = useEntryWrites();
  const ml = prefs === null ? null : prefs.glassMl;
  return {
    ml,
    add: (): void => {
      if (ml === null) {
        return;
      }
      const at = day === today ? Date.now() : momentOn(day, now);
      void writes.create(waterEntry(ml, at), '');
    },
  };
}
