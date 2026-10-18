import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../../components/skeleton';
import { useSizeClass } from '../../../design/size-class';
import type { Device } from '../../../store/state';
import { useRouterSnapshot, useSpeedTests } from '../router-data';
import { DevicesPreview, PeoplePreview, WifiPreview } from './previews';
import { RouterStrip } from './router-strip';
import { SpeedCard } from './speed-card';
import { TrafficCard } from './traffic-card';

export function RouterOverview({ device }: { readonly device: Device }): ReactNode {
  const stream = useRouterSnapshot();
  const medium = useSizeClass().width === 'medium';
  const tests = useSpeedTests();
  if (stream.state === 'waiting') {
    return <Skeleton shape="tile" />;
  }
  if (stream.state === 'invalid' || stream.value.connection.state === 'not_set_up') {
    return null;
  }
  const snapshot = stream.value;
  const last = tests.state === 'ready' ? (tests.tests[0] ?? null) : null;
  const traffic = <TrafficCard device={device} snapshot={snapshot} last={last} />;
  const strip = <RouterStrip device={device} snapshot={snapshot} />;
  const rest = (
    <>
      <SpeedCard snapshot={snapshot} />
      <PeoplePreview device={device} snapshot={snapshot} />
      <DevicesPreview device={device} snapshot={snapshot} />
      <WifiPreview device={device} snapshot={snapshot} />
    </>
  );
  if (!medium) {
    return (
      <View className="gap-section-gap">
        {traffic}
        {strip}
        {rest}
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-section-gap">
      <View className="min-w-0 flex-1 gap-section-gap">
        {traffic}
        {strip}
      </View>
      <View className="min-w-0 flex-1 gap-section-gap">{rest}</View>
    </View>
  );
}
