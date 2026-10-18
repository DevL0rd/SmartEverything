import type { AdGuardSnapshot, AdGuardStats } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import type { MetricItem } from '../../../components/metric-strip';
import { count, decimal, percent } from '../../../format/number';
import { clock } from '../../../format/time';

export function stripItems(
  snapshot: AdGuardSnapshot,
  stats: AdGuardStats,
  filtersHref: Href,
): readonly MetricItem[] {
  const stale = snapshot.connection.state !== 'online';
  const note = (fresh?: string): Pick<MetricItem, 'caption' | 'stale'> => {
    const caption = stale ? `as of ${clock(snapshot.at)}` : fresh;
    return caption === undefined ? { stale } : { stale, caption };
  };
  const enabled = snapshot.filters.filter((filter) => filter.enabled).length;
  const lists = snapshot.filters.length;
  return [
    { key: 'lookups', label: 'Lookups', value: count(stats.queries), ...note() },
    {
      key: 'blocked',
      label: 'Blocked',
      value: count(stats.blocked),
      ...note(percent(stats.blockedPercent / 100, 1)),
    },
    { key: 'answer', label: 'Answer time', value: decimal(stats.averageMs), unit: 'ms', ...note() },
    {
      key: 'lists',
      label: 'Filter lists',
      value: count(enabled),
      href: filtersHref,
      ...note(lists === 0 ? 'none added' : `of ${count(lists)} on`),
    },
    { key: 'malware', label: 'Malware', value: count(stats.malware), ...note() },
    { key: 'adult', label: 'Adult', value: count(stats.adult), ...note() },
  ];
}
