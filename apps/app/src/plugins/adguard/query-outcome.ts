import {
  QUERY_LOG_FILTERS,
  type AdGuardQuery,
  type AdGuardStats,
  type QueryLogFilter,
} from '@smarteverything/domain';
import type { IconName } from '../../components/icon';
import type { Tone } from '../../components/tone';
import type { VirtualSection } from '../../components/virtual-list';
import { clock, dayLabel, localDayKey } from '../../format/time';
import { ruleLines } from './model/own-rules';

export type QueryOutcome = AdGuardQuery['outcome'];

export const OUTCOME_TEXT: Readonly<Record<QueryOutcome, string>> = {
  blocked: 'Blocked',
  allowed: 'Allowed',
  rewritten: 'Rewritten',
};

export const OUTCOME_LOOK: Readonly<
  Record<QueryOutcome, { readonly icon: IconName; readonly tone: Tone }>
> = {
  blocked: { icon: 'ban', tone: 'critical' },
  allowed: { icon: 'circleCheck', tone: 'positive' },
  rewritten: { icon: 'route', tone: 'variant' },
};

export const FILTER_LABEL: Readonly<Record<QueryLogFilter, string>> = {
  all: 'All',
  blocked: 'Blocked',
  allowed: 'Allowed',
};

export const FILTER_ICON: Readonly<Record<QueryLogFilter, IconName>> = {
  all: 'list',
  blocked: 'ban',
  allowed: 'circleCheck',
};

export function plainDomain(domain: string): string {
  return domain.endsWith('.') ? domain.slice(0, -1) : domain;
}

export function deviceName(query: Pick<AdGuardQuery, 'client' | 'clientName'>): string {
  return query.clientName ?? query.client;
}

export function filterCounts(stats: AdGuardStats): Readonly<Record<QueryLogFilter, number>> {
  return {
    all: stats.queries,
    blocked: stats.blocked,
    allowed: stats.queries - stats.blocked,
  };
}

export function whenText(time: string, now: number): string {
  return `${dayLabel(time, now)} ${clock(time)}`;
}

export function ownRulesOf(rules: readonly string[], domain: string): readonly string[] {
  return ruleLines(rules)
    .filter((line) => line.domain === domain)
    .map((line) => line.text);
}

export interface LookupItem {
  readonly key: string;
  readonly query: AdGuardQuery;
}

export function sameLookup(left: LookupItem, right: LookupItem): boolean {
  return left.key === right.key;
}

export function lookupKey(item: LookupItem): string {
  return item.key;
}

function lookupItems(entries: readonly AdGuardQuery[]): readonly LookupItem[] {
  const seen = new Map<string, number>();
  return entries.map((query) => {
    const base = `${query.time}|${query.client}|${query.type}|${query.domain}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return { key: `${base}|${String(occurrence)}`, query };
  });
}

export function lookupSections(
  entries: readonly AdGuardQuery[],
  now: number,
): readonly VirtualSection<LookupItem>[] {
  const days = new Map<string, { title: string; data: LookupItem[] }>();
  for (const item of lookupItems(entries)) {
    const day = localDayKey(item.query.time);
    const section = days.get(day) ?? { title: dayLabel(item.query.time, now), data: [] };
    section.data.push(item);
    days.set(day, section);
  }
  return [...days].map(([key, section]) => ({ key, ...section }));
}

export function filterOf(value: string | null): QueryLogFilter {
  return QUERY_LOG_FILTERS.find((filter) => filter === value) ?? 'all';
}
