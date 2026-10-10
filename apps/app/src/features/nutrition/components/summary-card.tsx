import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { NutritionPref } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { useSizeClass } from '../../../design/size-class';
import type { DayTotals } from '../data/totals';
import { CalorieDial } from './calorie-dial';
import { EnergyBalance } from './energy-balance';
import { MacroList } from './macro-list';
import { WaterRow } from './water-row';

export function SummaryCard({
  totals,
  prefs,
  day,
  today,
}: {
  readonly totals: DayTotals;
  readonly prefs: NutritionPref | null;
  readonly day: string;
  readonly today: string;
}): ReactNode {
  const wide = useSizeClass().width !== 'compact';
  const burned = totals.total_energy;
  return (
    <Card>
      <View className="gap-5">
        <View className={wide ? 'flex-row items-center gap-8' : 'flex-row items-center gap-5'}>
          <CalorieDial
            eaten={totals.energy_in ?? null}
            goal={prefs === null ? null : prefs.energyKcal}
            size={wide ? 'l' : 'm'}
          />
          <View className="min-w-0 max-w-dialog flex-1">
            <MacroList totals={totals} prefs={prefs} />
          </View>
        </View>
        {burned === undefined ? null : (
          <EnergyBalance eaten={totals.energy_in ?? 0} burned={burned} />
        )}
        <View className="h-hairline bg-outline-variant" />
        <WaterRow litresDrunk={totals.hydration ?? 0} day={day} today={today} />
      </View>
    </Card>
  );
}
