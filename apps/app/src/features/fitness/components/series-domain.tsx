import type { ReactNode } from 'react';
import { Skeleton } from '../../../components/skeleton';
import { useFitnessParams } from '../data/day';
import { useHealthPresence } from '../data/presence';
import { seriesOf } from '../model/catalogue';
import { DOMAIN_INFO, seriesWithData, type FitnessDomain } from '../model/domains';
import { RANGES, windowOf, type Range } from '../model/window';
import { FitnessFrame } from './fitness-frame';
import { FitnessToolbar } from './fitness-toolbar';
import { MetricSection } from './metric-section';
import { NoDataRow } from './no-data-row';

export interface SeriesDomainProps {
  readonly domain: FitnessDomain;
  readonly range?: Range;
  readonly before?: ReactNode;
  readonly after?: ReactNode;
}

export function SeriesDomain({
  domain,
  range: initial = 'week',
  before,
  after,
}: SeriesDomainProps): ReactNode {
  const { day, today, range } = useFitnessParams(initial);
  const presence = useHealthPresence(today);
  const window = windowOf(range, day);
  const info = DOMAIN_INFO[domain];
  const keys = seriesWithData(presence.types, info.series);
  return (
    <FitnessFrame
      tab={domain}
      width="detail"
      toolbar={<FitnessToolbar day={day} today={today} range={range} ranges={RANGES} />}
    >
      {before}
      {keys.length === 0 && !presence.loaded ? <Skeleton shape="block" className="h-72" /> : null}
      {keys.length === 0 && presence.loaded ? (
        <NoDataRow what={`${info.title.toLowerCase()} data`} lastDay={null} />
      ) : null}
      {keys.map((key) => (
        <MetricSection key={key} spec={seriesOf(key)} window={window} />
      ))}
      {after}
    </FitnessFrame>
  );
}
