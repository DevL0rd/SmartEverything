import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Skeleton } from '../../../components/skeleton';
import type { Device } from '../../../store/state';
import { useAdGuardSnapshot } from '../adguard-data';
import { AdGuardFooter } from './adguard-footer';
import { AdGuardStrip } from './adguard-strip';
import { LookupsCard } from './lookups-card';
import { TopLists } from './top-lists';

const PREVIEW_ROWS = 5;

export function AdGuardOverview({ device }: { readonly device: Device }): ReactNode {
  const stream = useAdGuardSnapshot();
  if (stream.state === 'waiting') {
    return <Skeleton shape="tile" />;
  }
  if (stream.state === 'invalid' || stream.value.connection.state === 'not_set_up') {
    return null;
  }
  const snapshot = stream.value;
  const { stats } = snapshot;
  if (stats === null) {
    return null;
  }
  return (
    <View className="gap-section-gap">
      <LookupsCard device={device} snapshot={snapshot} stats={stats} />
      <AdGuardStrip device={device} snapshot={snapshot} stats={stats} />
      <TopLists
        device={device}
        stats={stats}
        lists={['blocked']}
        limit={PREVIEW_ROWS}
        stale={snapshot.connection.state !== 'online'}
      />
      <AdGuardFooter snapshot={snapshot} />
    </View>
  );
}
