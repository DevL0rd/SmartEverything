import type { AdGuardStats } from '@smarteverything/domain';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { RankedList } from '../../../components/ranked-list';
import type { Device } from '../../../store/state';
import { adguardSectionHref } from './links';
import { rankedEntries } from './top-model';

export type TopList = 'blocked' | 'queried' | 'clients';

const LISTS = {
  blocked: { title: 'Most blocked', noun: 'blocked lookups' },
  queried: { title: 'Most looked up', noun: 'lookups' },
  clients: { title: 'Busiest devices', noun: 'lookups' },
} as const;

const SOURCE = {
  blocked: (stats: AdGuardStats) => stats.topBlocked,
  queried: (stats: AdGuardStats) => stats.topQueried,
  clients: (stats: AdGuardStats) => stats.topClients,
} as const;

function queryOf(list: TopList, name: string): Readonly<Record<string, string>> {
  switch (list) {
    case 'blocked':
      return { search: name, filter: 'blocked' };
    case 'queried':
      return { search: name };
    case 'clients':
      return { client: name };
  }
}

export function TopLists({
  device,
  stats,
  lists,
  limit,
}: {
  readonly device: Device;
  readonly stats: AdGuardStats;
  readonly lists: readonly TopList[];
  readonly limit: number;
}): ReactNode {
  const router = useRouter();
  return (
    <View className="gap-section-gap">
      {lists.map((list) => {
        const entries = rankedEntries(SOURCE[list](stats), limit, LISTS[list].noun);
        return entries.length === 0 ? null : (
          <RankedList
            key={list}
            title={LISTS[list].title}
            entries={entries}
            onPress={(name) => {
              router.push(adguardSectionHref(device.id, 'queries', queryOf(list, name)));
            }}
          />
        );
      })}
    </View>
  );
}
