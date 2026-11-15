import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Grid } from '../../../components/grid';
import { Skeleton } from '../../../components/skeleton';
import { useFitnessParams } from '../data/day';
import { useHealthPresence } from '../data/presence';
import { seriesOf } from '../model/catalogue';
import { DOMAIN_INFO, seriesWithData, type FitnessDomain } from '../model/domains';
import { RANGES, windowOf, type Range } from '../model/window';
import { FitnessShell } from './fitness-shell';
import { FitnessToolbar } from './fitness-toolbar';
import { MetricSection } from './metric-section';
import { NoDataRow } from './no-data-row';

const CHART_MIN_WIDTH = 560;
const CHART_COLUMNS = 3;

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
    <FitnessShell
      tab={domain}
      toolbar={<FitnessToolbar day={day} today={today} range={range} ranges={RANGES} />}
    >
      {before}
      {keys.length === 0 && !presence.loaded ? (
        <Skeleton shape="block" className="h-72 w-full" />
      ) : null}
      {keys.length === 0 && presence.loaded ? (
        <View className="w-full">
          <NoDataRow what={`${info.title.toLowerCase()} data`} lastDay={null} />
        </View>
      ) : null}
      {keys.length === 0 ? null : (
        <Grid
          minItemWidth={CHART_MIN_WIDTH}
          maxColumns={Math.min(keys.length, CHART_COLUMNS)}
          stretchLastRow={false}
        >
          {keys.map((key) => (
            <MetricSection key={key} spec={seriesOf(key)} window={window} className="flex-1" />
          ))}
        </Grid>
      )}
      {after}
    </FitnessShell>
  );
}
