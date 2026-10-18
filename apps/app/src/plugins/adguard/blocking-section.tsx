import { usePluginScreen } from '../shared/plugin-log';
import type { AdGuardSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Device } from '../../store/state';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { useAdGuardSnapshot } from './adguard-data';
import { AdGuardFooter } from './model/adguard-footer';
import { AdGuardHero } from './model/adguard-hero';
import { AdGuardStrip } from './model/adguard-strip';
import { LookupsCard } from './model/lookups-card';
import { TopLists } from './model/top-lists';

const FULL_ROWS = 10;
const ALL_LISTS = ['blocked', 'queried', 'clients'] as const;

function Page({
  device,
  snapshot,
  beside,
}: {
  readonly device: Device;
  readonly snapshot: AdGuardSnapshot;
  readonly beside: boolean;
}): ReactNode {
  const { stats } = snapshot;
  const lists =
    stats === null ? null : (
      <TopLists
        device={device}
        stats={stats}
        lists={ALL_LISTS}
        limit={FULL_ROWS}
        stale={snapshot.connection.state !== 'online'}
      />
    );
  if (beside) {
    return lists;
  }
  return (
    <View className="gap-section-gap">
      <AdGuardHero />
      {stats === null ? null : (
        <>
          <LookupsCard device={device} snapshot={snapshot} stats={stats} />
          <AdGuardStrip device={device} snapshot={snapshot} stats={stats} />
        </>
      )}
      {lists}
      <AdGuardFooter snapshot={snapshot} />
    </View>
  );
}

export function BlockingSection({
  device,
  beside,
}: {
  readonly device: Device;
  readonly beside: boolean;
}): ReactNode {
  usePluginScreen('adguard', 'BlockingSection');
  return (
    <PluginStreamSection stream={useAdGuardSnapshot()} pluginId="adguard">
      {(snapshot) =>
        snapshot.connection.state === 'not_set_up' ? null : (
          <Page device={device} snapshot={snapshot} beside={beside} />
        )
      }
    </PluginStreamSection>
  );
}
