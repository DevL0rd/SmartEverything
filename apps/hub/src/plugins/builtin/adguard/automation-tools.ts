import { BLOCKABLE_DOMAIN, QUERY_LOG_REQUEST } from '@smarteverything/domain';
import { z } from 'zod';
import { failure, type HubToolResult } from '../../../ai-tools/hub-tool';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { attemptTool, DANGER_HINTS, READ_HINTS } from '../tool-kit';
import type { AdGuardClient } from './adguard-client';
import { changeProtection, readQueryLog, setDomainRule, setFilterEnabled } from './controls';

export const MINUTE_MS = 60_000;
export const PAUSE_MIN_MS = MINUTE_MS;
export const PAUSE_MAX_MS = 1440 * MINUTE_MS;
export const LOOKUPS_MIN = 1;
export const LOOKUPS_MAX = 100;

export const PROTECTION_STATES = ['on', 'pause', 'off'] as const;
export const DOMAIN_RULES = ['block', 'allow', 'remove'] as const;

export const SET_PROTECTION_INPUT = z.strictObject({
  state: z.enum(PROTECTION_STATES),
  duration: z.number().int().min(PAUSE_MIN_MS).max(PAUSE_MAX_MS).multipleOf(MINUTE_MS).optional(),
});

export const SET_FILTER_INPUT = z.strictObject({
  filter: z.string().regex(/^-?\d+$/, 'a filter list id'),
  enabled: z.boolean(),
});

export const SET_DOMAIN_RULE_INPUT = z.strictObject({
  domain: BLOCKABLE_DOMAIN,
  rule: z.enum(DOMAIN_RULES),
});

export const FIND_LOOKUPS_INPUT = z.strictObject({
  search: QUERY_LOG_REQUEST.shape.search.unwrap().optional(),
  outcome: QUERY_LOG_REQUEST.shape.filter.unwrap().optional(),
  olderThan: QUERY_LOG_REQUEST.shape.olderThan.unwrap().optional(),
  limit: QUERY_LOG_REQUEST.shape.limit.unwrap().optional(),
});

export const CLIENT_INFO_INPUT = z.strictObject({ client: z.string().trim().min(1).max(100) });

export const SET_PROTECTION_TOOL = { name: 'set_protection', input: SET_PROTECTION_INPUT };
export const SET_FILTER_TOOL = { name: 'set_filter', input: SET_FILTER_INPUT };
export const SET_DOMAIN_RULE_TOOL = { name: 'set_domain_rule', input: SET_DOMAIN_RULE_INPUT };
export const FIND_LOOKUPS_TOOL = { name: 'find_lookups', input: FIND_LOOKUPS_INPUT };
export const CLIENT_INFO_TOOL = { name: 'client_info', input: CLIENT_INFO_INPUT };

export interface AutomationToolPorts {
  readonly client: () => AdGuardClient;
  readonly changed: () => void;
}

type ProtectionInput = z.output<typeof SET_PROTECTION_INPUT>;

function protectionChange(input: ProtectionInput): Parameters<typeof changeProtection>[1] | null {
  if (input.state === 'on') return { enabled: true };
  if (input.state === 'off') return { enabled: false, minutes: null };
  return input.duration === undefined
    ? null
    : { enabled: false, minutes: input.duration / MINUTE_MS };
}

function setProtection(ports: AutomationToolPorts, input: ProtectionInput): Promise<HubToolResult> {
  const change = protectionChange(input);
  if (change === null) {
    return Promise.resolve(
      failure('Choose how long to pause ad blocking', { code: 'invalid_arguments' }),
    );
  }
  return attemptTool(async () => {
    const done = await changeProtection(ports.client(), change);
    ports.changed();
    const until =
      change.enabled || change.minutes === null
        ? {}
        : { until: new Date(Date.now() + change.minutes * MINUTE_MS).toISOString() };
    return { done, protection: change.enabled, ...until };
  });
}

function setFilter(
  ports: AutomationToolPorts,
  input: z.output<typeof SET_FILTER_INPUT>,
): Promise<HubToolResult> {
  return attemptTool(async () => {
    const done = await setFilterEnabled(ports.client(), Number(input.filter), input.enabled);
    ports.changed();
    return { done };
  });
}

function setRule(
  ports: AutomationToolPorts,
  input: z.output<typeof SET_DOMAIN_RULE_INPUT>,
): Promise<HubToolResult> {
  return attemptTool(async () => {
    const done = await setDomainRule(ports.client(), input.domain, input.rule);
    ports.changed();
    return { done };
  });
}

function findLookups(
  ports: AutomationToolPorts,
  input: z.output<typeof FIND_LOOKUPS_INPUT>,
): Promise<HubToolResult> {
  return attemptTool(async () => {
    const request = QUERY_LOG_REQUEST.parse({
      search: input.search,
      filter: input.outcome,
      olderThan: input.olderThan,
      limit: input.limit,
    });
    const page = await readQueryLog(ports.client(), request);
    return { page, count: page.entries.length };
  });
}

export function automationTools(ports: AutomationToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: SET_PROTECTION_TOOL.name,
      title: 'Set ad blocking',
      description:
        'Turns AdGuard Home protection on, pauses it for a whole number of minutes (1 to 1440, given as a duration in milliseconds) or turns it off with no end time. Answers the end time of a pause.',
      input: SET_PROTECTION_INPUT,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: (input) => setProtection(ports, input),
    }),
    definePluginTool({
      name: SET_FILTER_TOOL.name,
      title: 'Turn a filter list on or off',
      description: 'Turns one AdGuard Home filter list (id from status) on or off.',
      input: SET_FILTER_INPUT,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: (input) => setFilter(ports, input),
    }),
    definePluginTool({
      name: SET_DOMAIN_RULE_TOOL.name,
      title: 'Block, allow or release a domain',
      description:
        'Adds a custom rule that blocks or always allows a domain and its subdomains, or removes the custom rule so the filter lists decide again.',
      input: SET_DOMAIN_RULE_INPUT,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: (input) => setRule(ports, input),
    }),
    definePluginTool({
      name: FIND_LOOKUPS_TOOL.name,
      title: 'Find recent DNS lookups',
      description:
        'Recent DNS lookups, newest first: domain, client, blocked/allowed/rewritten and the rule. Filter by search text and outcome; page with olderThan from the previous answer (up to 100 per page).',
      input: FIND_LOOKUPS_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: (input) => findLookups(ports, input),
    }),
  ];
}
