import { usePluginScreen } from '../shared/plugin-log';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../components/skeleton';
import type { Device } from '../../store/state';
import { RouterCard } from './overview/router-card';
import { RouterHero } from './overview/router-hero';
import { RouterStrip } from './overview/router-strip';
import { SpeedCard } from './overview/speed-card';
import { TrafficCard } from './overview/traffic-card';
import { useRouterSnapshot, useSpeedTests } from './router-data';

export function InternetSection({
  device,
  beside,
}: {
  readonly device: Device;
  readonly beside: boolean;
}): ReactNode {
  usePluginScreen('router', 'InternetSection');
  const stream = useRouterSnapshot();
  const tests = useSpeedTests();
  const last = tests.state === 'ready' ? (tests.tests[0] ?? null) : null;
  const snapshot = stream.state === 'ready' ? stream.value : null;
  return (
    <View className="gap-section-gap">
      {beside ? null : <RouterHero device={device} />}
      {stream.state === 'waiting' ? <Skeleton shape="tile" /> : null}
      {snapshot === null || snapshot.connection.state === 'not_set_up' ? null : (
        <>
          <TrafficCard device={device} snapshot={snapshot} last={last} />
          <RouterStrip device={device} snapshot={snapshot} />
          <SpeedCard snapshot={snapshot} />
          <RouterCard snapshot={snapshot} />
        </>
      )}
    </View>
  );
}
