import type { FlowType } from '@smarteverything/domain';
import {
  actionNode,
  automation,
  entity,
  eventTrigger,
  input,
  optionalInput,
  output,
  ports,
  queryNode,
  streamValue,
  type PortKind,
} from '../automation-kit';
import {
  CLIENT_INFO_TOOL,
  FIND_LOOKUPS_TOOL,
  LOOKUPS_MAX,
  LOOKUPS_MIN,
  MINUTE_MS,
  PAUSE_MAX_MS,
  PAUSE_MIN_MS,
  SET_DOMAIN_RULE_TOOL,
  SET_FILTER_TOOL,
  SET_PROTECTION_TOOL,
} from './automation-tools';
import { PROTECTION_CHANGED_EVENT, SNAPSHOT_STREAM } from './runtime';

const PLUGIN = 'adguard';
const TIMEOUT = { default: 30_000, max: 120_000 } as const;
const DEFAULT_PAUSE_MS = 60 * MINUTE_MS;

export const PROTECTION_CHANGED = {
  kind: PROTECTION_CHANGED_EVENT,
  title: 'Ad blocking turned on or off',
  fields: { enabled: 'boolean', until: 'string', state: 'string' },
} as const;

const INSTANT: PortKind<string> = { type: { t: 'instant' } };

function maybe<V>(kind: PortKind<V>): PortKind<V | undefined> {
  return { type: { t: 'optional', of: kind.type } };
}

function record(fields: Readonly<Record<string, PortKind<unknown>>>): PortKind<unknown> {
  const typed: Record<string, FlowType> = {};
  for (const [name, kind] of Object.entries(fields)) typed[name] = kind.type;
  return { type: { t: 'record', fields: typed } };
}

const FILTER = entity(PLUGIN, {
  id: 'filter',
  title: 'Filter list',
  plural: 'Filter lists',
  options: 'filters',
});

const CLIENT = entity(PLUGIN, {
  id: 'client',
  title: 'DNS client',
  plural: 'DNS clients',
  options: 'clients',
});

const PROTECTION_CHOICES = [
  { id: 'on', label: 'On' },
  { id: 'pause', label: 'Paused for a while' },
  { id: 'off', label: 'Off' },
] as const;

const TURNED_CHOICES = [
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' },
] as const;

const RULE_CHOICES = [
  { id: 'block', label: 'Block' },
  { id: 'allow', label: 'Always allow' },
  { id: 'remove', label: 'Remove the rule' },
] as const;

const OUTCOME_CHOICES = [
  { id: 'all', label: 'Any' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'allowed', label: 'Allowed' },
] as const;

const LOOKUP_OUTCOMES = ports.choice([
  { id: 'blocked', label: 'Blocked' },
  { id: 'allowed', label: 'Allowed' },
  { id: 'rewritten', label: 'Rewritten' },
] as const);

const PROTECTION = actionNode({
  id: 'protection',
  version: 1,
  title: 'Set ad blocking',
  description: 'Turns ad blocking on, pauses it for a while or turns it off for the whole network.',
  icon: 'shield',
  keywords: ['adguard', 'dns', 'ads', 'pause', 'protection'],
  summary: 'Set ad blocking: {state}',
  tool: SET_PROTECTION_TOOL,
  inputs: {
    state: input(ports.choice(PROTECTION_CHOICES), {
      title: 'Ad blocking',
      description: 'On, paused for a while or off.',
    }),
    for: optionalInput(ports.duration(), {
      title: 'Pause for',
      description: 'How long ad blocking stays paused. Only used when it is paused.',
      default: DEFAULT_PAUSE_MS,
      ui: { min: PAUSE_MIN_MS, max: PAUSE_MAX_MS, step: MINUTE_MS },
    }),
  },
  outputs: {
    until: output(INSTANT, {
      title: 'Back on at',
      description: 'When a pause ends and ad blocking turns itself back on.',
      from: '/until',
      optional: true,
    }),
  },
  args: { state: { port: 'state' }, duration: { port: 'for' } },
  timeout: TIMEOUT,
  retry: 'idempotent',
  waitOnly: ['until'],
});

const FILTER_LIST = actionNode({
  id: 'filter_list',
  version: 1,
  title: 'Turn a filter list on or off',
  description: 'Turns one AdGuard Home filter list on or off.',
  icon: 'filter',
  keywords: ['adguard', 'dns', 'blocklist', 'filter'],
  summary: 'Filter list {list} on: {on}',
  tool: SET_FILTER_TOOL,
  inputs: {
    list: input(FILTER.kind, { title: 'Filter list', description: 'The list to switch.' }),
    on: input(ports.boolean(), {
      title: 'On',
      description: 'Whether the list is used.',
    }),
  },
  args: { filter: { port: 'list' }, enabled: { port: 'on' } },
  timeout: TIMEOUT,
  retry: 'idempotent',
});

const DOMAIN_RULE = actionNode({
  id: 'domain_rule',
  version: 1,
  title: 'Block or allow a domain',
  description:
    'Blocks a domain and its subdomains, always allows it or removes the custom rule for it.',
  icon: 'ban',
  keywords: ['adguard', 'dns', 'block', 'allow', 'domain', 'rule'],
  summary: '{rule} {domain}',
  tool: SET_DOMAIN_RULE_TOOL,
  inputs: {
    domain: input(ports.text(), {
      title: 'Domain',
      description: 'A domain such as ads.example.com.',
    }),
    rule: input(ports.choice(RULE_CHOICES), {
      title: 'Rule',
      description: 'Block it, always allow it or remove the custom rule.',
    }),
  },
  args: { domain: { port: 'domain' }, rule: { port: 'rule' } },
  timeout: TIMEOUT,
});

const CLIENT_LOOKUPS = queryNode({
  id: 'client_lookups',
  version: 1,
  title: 'DNS client',
  description: 'What AdGuard Home knows about one client and how many lookups it made.',
  icon: 'monitor',
  keywords: ['adguard', 'dns', 'client', 'device', 'lookups'],
  summary: 'DNS client {client}',
  tool: CLIENT_INFO_TOOL,
  inputs: {
    client: input(CLIENT.kind, { title: 'Client', description: 'The client to look up.' }),
  },
  outputs: {
    name: output(maybe(ports.text()), {
      title: 'Name',
      description: 'The name AdGuard Home has for the client.',
      from: '/client/name',
    }),
    queries: output(ports.number({ integer: true, min: 0 }), {
      title: 'Lookups',
      description: 'Lookups the client made in the statistics period.',
      from: '/client/queriesInStats',
    }),
  },
  args: { client: { port: 'client' } },
  timeout: TIMEOUT,
  retry: 'idempotent',
  budget: 'none',
});

const QUERY_LOG = queryNode({
  id: 'query_log',
  version: 1,
  title: 'Recent DNS lookups',
  description: 'The newest DNS lookups, filtered by search text and outcome.',
  icon: 'search',
  keywords: ['adguard', 'dns', 'log', 'lookups', 'queries'],
  summary: 'Recent {outcome} lookups matching {search}',
  tool: FIND_LOOKUPS_TOOL,
  inputs: {
    search: optionalInput(ports.text(), {
      title: 'Search',
      description: 'Only lookups whose domain or client contains this text.',
    }),
    outcome: optionalInput(ports.choice(OUTCOME_CHOICES), {
      title: 'Outcome',
      description: 'Blocked, allowed or any.',
      default: 'all',
    }),
    limit: optionalInput(ports.number({ integer: true, min: LOOKUPS_MIN, max: LOOKUPS_MAX }), {
      title: 'How many',
      description: 'The most lookups to read.',
      default: 50,
      ui: { min: LOOKUPS_MIN, max: LOOKUPS_MAX, step: 1 },
    }),
  },
  outputs: {
    lookups: output(
      ports.list(
        record({
          domain: ports.text(),
          client: ports.text(),
          clientName: maybe(ports.text()),
          outcome: LOOKUP_OUTCOMES,
          rule: maybe(ports.text()),
          time: INSTANT,
        }),
      ),
      {
        title: 'Lookups',
        description: 'The lookups, newest first.',
        from: '/page/entries',
      },
    ),
    count: output(ports.number({ integer: true, min: 0 }), {
      title: 'Count',
      description: 'How many lookups were read.',
      from: '/count',
    }),
  },
  args: {
    search: { port: 'search' },
    outcome: { port: 'outcome' },
    limit: { port: 'limit' },
  },
  timeout: TIMEOUT,
  retry: 'idempotent',
  budget: 'none',
});

const PROTECTION_TRIGGER = eventTrigger({
  id: 'protection_changed',
  version: 1,
  title: 'Ad blocking turned on or off',
  description: 'Fires when ad blocking is turned on, paused or turned off.',
  icon: 'shield',
  keywords: ['adguard', 'dns', 'ads', 'protection'],
  summary: 'Ad blocking turned {to}',
  event: PROTECTION_CHANGED,
  filters: {
    to: {
      kind: ports.choice(TURNED_CHOICES),
      title: 'Turned',
      description: 'Only when ad blocking changed to this.',
      match: 'state',
    },
  },
  outputs: {
    enabled: { kind: ports.boolean(), title: 'Ad blocking is on', from: 'enabled' },
    until: { kind: maybe(INSTANT), title: 'Back on at', from: 'until' },
  },
});

const STATUS = streamValue({
  id: 'status',
  version: 1,
  title: 'Ad blocking status',
  description: 'Whether ad blocking is on and how many lookups it has handled.',
  icon: 'shield',
  keywords: ['adguard', 'dns', 'ads', 'statistics'],
  summary: 'Ad blocking status',
  stream: SNAPSHOT_STREAM,
  outputs: {
    enabled: { kind: ports.boolean(), from: '/status/protection' },
    pausedUntil: { kind: maybe(INSTANT), from: '/status/pausedUntil' },
    queries: { kind: ports.number({ integer: true, min: 0 }), from: '/stats/queries' },
    blocked: { kind: ports.number({ integer: true, min: 0 }), from: '/stats/blocked' },
    blockedPercent: {
      kind: ports.number({ min: 0, max: 100, unit: '%' }),
      from: '/stats/blockedPercent',
    },
    averageMs: { kind: ports.number({ min: 0, unit: 'ms' }), from: '/stats/averageMs' },
    topBlocked: {
      kind: ports.list(record({ name: ports.text(), count: ports.number({ integer: true }) })),
      from: '/stats/topBlocked',
    },
  },
});

export const ADGUARD_AUTOMATION = automation({
  nodes: [PROTECTION, FILTER_LIST, DOMAIN_RULE, CLIENT_LOOKUPS, QUERY_LOG],
  triggers: [PROTECTION_TRIGGER],
  values: [STATUS],
  entities: [FILTER, CLIENT],
});
