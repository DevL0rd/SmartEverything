import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useMaxHeartRateSetting } from '../../../features/fitness/data/goals';
import { useLivePoints, useLiveSelect } from '../data/treadmill-data';
import { countersOf, TREND_OF } from '../model/counters-model';
import { seriesOf } from '../model/speed-history';
import { CounterTile } from './counter-tile';

export function LiveCounters({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const frame = useLiveSelect(deviceId, view.frame, (live) => live);
  const points = useLivePoints(deviceId, view.recentSpeed);
  const maxBpm = useMaxHeartRateSetting();
  return (
    <View className="flex-row flex-wrap gap-3">
      {countersOf(view, frame, maxBpm).map((spec) => (
        <CounterTile
          key={spec.key}
          label={spec.label}
          value={spec.value}
          widest={spec.widest}
          {...(spec.unit === undefined ? {} : { unit: spec.unit })}
          {...(spec.colour === undefined ? {} : { colour: spec.colour })}
          {...(spec.note === undefined ? {} : { note: spec.note })}
          {...(spec.trend === undefined ? {} : { trend: seriesOf(points, TREND_OF[spec.trend]) })}
        />
      ))}
    </View>
  );
}
