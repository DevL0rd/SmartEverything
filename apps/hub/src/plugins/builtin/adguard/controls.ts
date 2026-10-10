import type {
  AdGuardClientInfo,
  AdGuardStats,
  QueryLogFilter,
  QueryLogPage,
  QueryLogRequest,
} from '@smarteverything/domain';
import type { AdGuardClient } from './adguard-client';
import { CLIENTS_REPLY, FILTERING_REPLY, QUERY_LOG_REPLY } from './api-schemas';
import { clientInfoOf, filtersOf, queryOf } from './readings';
import { ruleKindFor, withDomainRule, type DomainRuleChange } from './user-rules';

class AdGuardControlError extends Error {
  override readonly name = 'AdGuardControlError';
}

type ProtectionChange =
  { readonly enabled: true } | { readonly enabled: false; readonly minutes: number | null };

export async function changeProtection(
  client: AdGuardClient,
  change: ProtectionChange,
): Promise<string> {
  if (change.enabled) {
    await client.write('/control/protection', { enabled: true });
    return 'Ad blocking is on';
  }
  if (change.minutes === null) {
    await client.write('/control/protection', { enabled: false });
    return 'Ad blocking is off until you turn it back on';
  }
  await client.write('/control/protection', {
    enabled: false,
    duration: change.minutes * 60_000,
  });
  return `Ad blocking is paused for ${String(change.minutes)} minutes`;
}

export async function setFilterEnabled(
  client: AdGuardClient,
  filterId: number,
  enabled: boolean,
): Promise<string> {
  const filters = filtersOf(await client.read('/control/filtering/status', FILTERING_REPLY));
  const filter = filters.find((candidate) => candidate.id === filterId);
  if (filter === undefined) {
    throw new AdGuardControlError('AdGuard Home has no filter list with that id');
  }
  await client.write('/control/filtering/set_url', {
    url: filter.url,
    whitelist: filter.allowList,
    data: { name: filter.name, url: filter.url, enabled },
  });
  return `${filter.name} is ${enabled ? 'on' : 'off'}`;
}

export async function setDomainRule(
  client: AdGuardClient,
  domain: string,
  change: DomainRuleChange,
): Promise<string> {
  const filtering = await client.read('/control/filtering/status', FILTERING_REPLY);
  const current = filtering.user_rules ?? [];
  if (change === 'remove' && ruleKindFor(current, domain) === null) {
    throw new AdGuardControlError(`There is no custom rule for ${domain}`);
  }
  await client.write('/control/filtering/set_rules', {
    rules: withDomainRule(current, domain, change),
  });
  return DONE_TEXT[change](domain);
}

const DONE_TEXT: Readonly<Record<DomainRuleChange, (domain: string) => string>> = {
  block: (domain) => `${domain} is blocked`,
  allow: (domain) => `${domain} is always allowed`,
  remove: (domain) => `${domain} follows the filter lists again`,
};

const RESPONSE_STATUS: Readonly<Record<QueryLogFilter, string>> = {
  all: 'all',
  blocked: 'filtered',
  allowed: 'processed',
};

export async function readQueryLog(
  client: AdGuardClient,
  request: QueryLogRequest,
): Promise<QueryLogPage> {
  const reply = await client.read('/control/querylog', QUERY_LOG_REPLY, {
    limit: String(request.limit),
    response_status: RESPONSE_STATUS[request.filter],
    ...(request.search.length > 0 ? { search: request.search } : {}),
    ...(request.olderThan === null ? {} : { older_than: request.olderThan }),
  });
  const entries = (reply.data ?? []).map(queryOf);
  const more = entries.length >= request.limit && reply.oldest.length > 0;
  return { entries, olderThan: more ? new Date(reply.oldest).toISOString() : null };
}

export async function readClientInfo(
  client: AdGuardClient,
  query: string,
  stats: AdGuardStats | null,
): Promise<AdGuardClientInfo> {
  return clientInfoOf(query, await client.read('/control/clients', CLIENTS_REPLY), stats);
}
