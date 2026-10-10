import type { AdGuardFilter, PluginSearchEntry } from '@smarteverything/domain';
import { ADGUARD_EXTERNAL_ID } from './adguard-device';

const ADGUARD_SECTIONS = {
  blocking: 'blocking',
  queries: 'queries',
  filters: 'filters',
} as const;

type Section = (typeof ADGUARD_SECTIONS)[keyof typeof ADGUARD_SECTIONS];

function entry(
  id: string,
  title: string,
  section: Section | null,
  extra: Pick<PluginSearchEntry, 'subtitle' | 'keywords'> & {
    readonly query?: Record<string, string>;
  },
): PluginSearchEntry {
  return {
    id,
    title,
    subtitle: extra.subtitle,
    keywords: extra.keywords,
    target: { kind: 'device', externalId: ADGUARD_EXTERNAL_ID, section, query: extra.query ?? {} },
  };
}

const PAGE_ENTRIES: readonly PluginSearchEntry[] = [
  entry('adguard', 'AdGuard Home', null, {
    subtitle: 'Ad blocker',
    keywords: ['adguard', 'dns', 'ads', 'trackers'],
  }),
  entry('adguard.blocking', 'Ad blocking', ADGUARD_SECTIONS.blocking, {
    subtitle: 'AdGuard Home',
    keywords: ['blocked', 'protection', 'top domains'],
  }),
  entry('adguard.pause', 'Pause ad blocking', ADGUARD_SECTIONS.blocking, {
    subtitle: 'AdGuard Home',
    keywords: ['turn off ad blocking', 'disable adguard'],
    query: { pause: 'open' },
  }),
  entry('adguard.queries', 'DNS query log', ADGUARD_SECTIONS.queries, {
    subtitle: 'AdGuard Home',
    keywords: ['lookups', 'queries', 'blocked sites', 'unblock'],
  }),
  entry('adguard.filters', 'Filter lists', ADGUARD_SECTIONS.filters, {
    subtitle: 'AdGuard Home',
    keywords: ['blocklists', 'rules', 'filters'],
  }),
];

export function adguardSearchEntries(filters: readonly AdGuardFilter[]): PluginSearchEntry[] {
  return [
    ...PAGE_ENTRIES,
    ...filters.map((filter) =>
      entry(`adguard.filter.${String(filter.id)}`, filter.name, ADGUARD_SECTIONS.filters, {
        subtitle: filter.allowList ? 'Allow list' : 'Filter list',
        keywords: ['filter list'],
        query: { filter: String(filter.id) },
      }),
    ),
  ];
}

export function adguardSearchSignature(filters: readonly AdGuardFilter[]): string {
  return filters.map((filter) => `${String(filter.id)}|${filter.name}`).join('\n');
}
