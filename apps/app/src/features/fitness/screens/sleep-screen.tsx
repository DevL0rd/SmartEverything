import type { ReactNode } from 'react';
import { FitnessFrame } from '../components/fitness-frame';
import { FitnessToolbar } from '../components/fitness-toolbar';
import { MetricSection } from '../components/metric-section';
import { NightCard } from '../components/night-card';
import { SleepPatternCard } from '../components/sleep-pattern-card';
import { useFitnessParams } from '../data/day';
import { seriesOf } from '../model/catalogue';
import { RANGES, windowOf } from '../model/window';

export function SleepScreen(): ReactNode {
  const { day, today, range } = useFitnessParams('week');
  const window = windowOf(range, day);
  return (
    <FitnessFrame
      tab="sleep"
      width="detail"
      toolbar={<FitnessToolbar day={day} today={today} range={range} ranges={RANGES} />}
    >
      <NightCard day={day} quiet={range !== 'day'} />
      {range === 'day' ? null : <MetricSection spec={seriesOf('sleep')} window={window} />}
      {range === 'day' ? null : <SleepPatternCard window={window} />}
    </FitnessFrame>
  );
}
