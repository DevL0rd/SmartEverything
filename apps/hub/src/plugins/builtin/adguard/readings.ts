import type {
  AdGuardClientInfo,
  AdGuardFilter,
  AdGuardQuery,
  AdGuardStats,
  AdGuardStatus,
  AdGuardTopEntry,
} from '@smarteverything/domain';
import type {
  ClientsReply,
  FilteringReply,
  QueryRow,
  StatsReply,
  StatusReply,
} from './api-schemas';

const TOP_LIMIT = 10;

export function statusOf(reply: StatusReply, now: Date): AdGuardStatus {
  return {
    version: reply.version.length > 0 ? reply.version : null,
    running: reply.running,
    protection: reply.protection_enabled,
    pausedUntil: reply.protection_enabled ? null : pausedUntilOf(reply, now),
  };
}

function pausedUntilOf(reply: StatusReply, now: Date): string | null {
  const until = reply.protection_disabled_until ?? null;
  if (until !== null && until.length > 0) {
    return new Date(until).toISOString();
  }
  const duration = reply.protection_disabled_duration ?? 0;
  return duration > 0 ? new Date(now.getTime() + duration).toISOString() : null;
}

export function clientNames(reply: ClientsReply): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const client of reply.auto_clients ?? []) {
    if (client.name.length > 0) {
      names.set(client.ip, client.name);
    }
  }
  for (const client of reply.clients ?? []) {
    client.ids.forEach((id) => names.set(id, client.name));
  }
  return names;
}

export function statsOf(reply: StatsReply, names: ReadonlyMap<string, string>): AdGuardStats {
  const queries = reply.num_dns_queries;
  const blocked = reply.num_blocked_filtering;
  return {
    queries,
    blocked,
    blockedPercent: queries === 0 ? 0 : Math.round((blocked / queries) * 1000) / 10,
    averageMs: Math.round(reply.avg_processing_time * 10_000) / 10,
    malware: reply.num_replaced_safebrowsing,
    adult: reply.num_replaced_parental,
    topQueried: topOf(reply.top_queried_domains),
    topBlocked: topOf(reply.top_blocked_domains),
    topClients: topOf(reply.top_clients).map((entry) => ({
      ...entry,
      name: names.get(entry.name) ?? entry.name,
    })),
    history: reply.dns_queries,
    historyBlocked: reply.blocked_filtering,
    timeUnit: reply.time_units,
  };
}

function topOf(list: readonly Readonly<Record<string, number>>[]): AdGuardTopEntry[] {
  return list
    .slice(0, TOP_LIMIT)
    .flatMap((entry) => Object.entries(entry).slice(0, 1))
    .map(([name, count]) => ({ name, count: Math.max(0, Math.round(count)) }));
}

export function filtersOf(reply: FilteringReply): AdGuardFilter[] {
  const lists = [
    ...(reply.filters ?? []).map((filter) => ({ filter, allowList: false })),
    ...(reply.whitelist_filters ?? []).map((filter) => ({ filter, allowList: true })),
  ];
  return lists.map(({ filter, allowList }) => ({
    id: filter.id,
    name: filter.name.length > 0 ? filter.name : filter.url,
    url: filter.url,
    enabled: filter.enabled,
    rules: filter.rules_count,
    updatedAt: filter.last_updated ?? null,
    allowList,
  }));
}

export function queryOf(row: QueryRow): AdGuardQuery {
  return {
    time: new Date(row.time).toISOString(),
    domain: row.question.unicode_name ?? row.question.name,
    type: row.question.type,
    client: row.client,
    clientName: nonEmpty(row.client_info?.name),
    outcome: outcomeOf(row.reason),
    reason: row.reason,
    rule: row.rules?.[0]?.text ?? null,
    elapsedMs: elapsedOf(row.elapsedMs),
    upstream: nonEmpty(row.upstream),
    cached: row.cached,
  };
}

function nonEmpty(text: string | undefined): string | null {
  return text === undefined || text.length === 0 ? null : text;
}

function elapsedOf(raw: string | number | undefined): number | null {
  const elapsed = Number(raw ?? Number.NaN);
  return Number.isFinite(elapsed) ? Math.round(elapsed * 10) / 10 : null;
}

function outcomeOf(reason: string): AdGuardQuery['outcome'] {
  if (reason.startsWith('Filtered')) {
    return 'blocked';
  }
  return reason.startsWith('Rewrite') ? 'rewritten' : 'allowed';
}

type ConfiguredClient = NonNullable<ClientsReply['clients']>[number];
type DetectedClient = NonNullable<ClientsReply['auto_clients']>[number];

function findConfigured(clients: ClientsReply, wanted: string): ConfiguredClient | null {
  return (
    (clients.clients ?? []).find(
      (client) =>
        client.name.toLowerCase() === wanted ||
        client.ids.some((id) => id.toLowerCase() === wanted),
    ) ?? null
  );
}

function findDetected(clients: ClientsReply, wanted: string): DetectedClient | null {
  return (
    (clients.auto_clients ?? []).find(
      (client) => client.ip === wanted || client.name.toLowerCase() === wanted,
    ) ?? null
  );
}

function identityOf(
  clients: ClientsReply,
  wanted: string,
): Pick<AdGuardClientInfo, 'name' | 'ids' | 'source'> & { configured: ConfiguredClient | null } {
  const configured = findConfigured(clients, wanted);
  const detected = findDetected(clients, wanted);
  if (configured !== null) {
    return {
      name: nonEmpty(configured.name),
      ids: configured.ids,
      source: 'configured',
      configured,
    };
  }
  return detected === null
    ? { name: null, ids: [], source: 'unknown', configured }
    : { name: nonEmpty(detected.name), ids: [detected.ip], source: 'detected', configured };
}

export function clientInfoOf(
  query: string,
  clients: ClientsReply,
  stats: AdGuardStats | null,
): AdGuardClientInfo {
  const { configured, ...identity } = identityOf(clients, query.trim().toLowerCase());
  const counted = (stats?.topClients ?? []).find(
    (entry) => entry.name === identity.name || identity.ids.includes(entry.name),
  );
  return {
    query,
    ...identity,
    ownSettings: configured?.use_global_settings === false,
    filtering: configured?.filtering_enabled ?? null,
    blockedServices: configured?.blocked_services ?? [],
    queriesInStats: counted?.count ?? 0,
  };
}
