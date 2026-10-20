import type { ReactNode } from 'react';
import { FitnessFrame } from '../components/fitness-frame';
import { FitnessToolbar } from '../components/fitness-toolbar';
import { NightCard } from '../components/night-card';
import { SleepPatternCard } from '../components/sleep-pattern-card';
import { SleepTrendCard } from '../components/sleep-trend-card';
import { useSleepTrend } from '../data/sleep-trend';
import { useFitnessParams } from '../data/day';
import { RANGES, windowOf, type Window } from '../model/window';

function Trends({ window, today }: { readonly window: Window; readonly today: string }): ReactNode {
  const view = useSleepTrend(window, today);
  return (
    <>
      <SleepPatternCard view={view} today={today} />
      <SleepTrendCard view={view} today={today} />
    </>
  );
}

export function SleepScreen(): ReactNode {
  const { day, today, range } = useFitnessParams('week');
  return (
    <FitnessFrame
      tab="sleep"
      width="detail"
      toolbar={<FitnessToolbar day={day} today={today} range={range} ranges={RANGES} />}
    >
      <NightCard day={day} quiet={range !== 'day'} />
      {range === 'day' ? null : <Trends window={windowOf(range, day)} today={today} />}
    </FitnessFrame>
  );
}
