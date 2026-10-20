import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { useMaxHeartRateSetting } from '../../../features/fitness/data/goals';
import { useSessionTarget } from '../data/session-target';
import { useLivePoints, useLiveSelect } from '../data/treadmill-data';
import { heartZoneSeconds, seriesOf, steppedSeries } from '../model/speed-history';
import { GoalRing } from './goal-ring';
import { InclineTrack } from './incline-track';
import { LiveCounters } from './live-counters';
import { HeartChart, SpeedChart } from './speed-chart';
import { HeartZoneBar, ZoneBar } from './zone-bar';

function LiveZones({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const session = useLiveSelect(deviceId, view.frame, (frame) => frame.session);
  const heartRate = useLiveSelect(deviceId, view.frame, (frame) =>
    frame.body === null ? null : frame.body.heartRate,
  );
  const points = useLivePoints(deviceId, view.recentSpeed);
  const maxBpm = useMaxHeartRateSetting();
  const target = useSessionTarget(deviceId);
  if (heartRate !== null && maxBpm !== null && view.bodyVisible) {
    return (
      <View className="gap-2">
        <Text variant="caption" tone="variant">
          Heart rate zones, last 5 minutes
        </Text>
        <HeartZoneBar seconds={heartZoneSeconds(points, maxBpm)} target={target.zone} />
      </View>
    );
  }
  if (session === null) {
    return null;
  }
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        Time in each speed zone this session
      </Text>
      <ZoneBar zones={session.zones} />
    </View>
  );
}

function chartTitle(hasIncline: boolean, hasHeart: boolean): string {
  const parts = ['Speed', ...(hasIncline ? ['incline'] : []), ...(hasHeart ? ['heart rate'] : [])];
  return parts.length === 1
    ? 'Speed, last 5 minutes'
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}, last 5 minutes`;
}

export function LiveBand({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
}): ReactNode {
  const heartRate = useLiveSelect(deviceId, view.frame, (frame) =>
    frame.body === null ? null : frame.body.heartRate,
  );
  const points = useLivePoints(deviceId, view.recentSpeed);
  const showHeart =
    view.bodyVisible &&
    heartRate !== null &&
    seriesOf(points, (point) => point.heartRate).length >= 2;
  const showIncline =
    view.limits.incline !== null && steppedSeries(points, (point) => point.incline).length >= 2;
  return (
    <Card title="This session" icon="activity">
      <View className="gap-4">
        <LiveCounters deviceId={deviceId} view={view} />
        <View className="gap-1">
          <Text variant="caption" tone="variant">
            {chartTitle(showIncline, showHeart)}
          </Text>
          <SpeedChart deviceId={deviceId} view={view} />
          <InclineTrack deviceId={deviceId} view={view} />
          {showHeart ? <HeartChart deviceId={deviceId} view={view} /> : null}
        </View>
        <LiveZones deviceId={deviceId} view={view} />
        <GoalRing deviceId={deviceId} view={view} />
      </View>
    </Card>
  );
}
