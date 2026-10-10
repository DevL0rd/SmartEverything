import {
  BLOCKABLE_DOMAIN,
  PAUSE_MINUTES,
  QUERY_LOG_REQUEST,
  type AdGuardSnapshot,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { HubToolResult } from '../../../ai-tools/hub-tool';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import {
  attemptTool,
  DANGER_HINTS,
  NO_INPUT,
  ownerOnly,
  READ_HINTS,
  toolResult,
  WRITE_HINTS,
} from '../tool-kit';
import type { AdGuardClient } from './adguard-client';
import {
  changeProtection,
  readClientInfo,
  readQueryLog,
  setDomainRule,
  setFilterEnabled,
} from './controls';

interface AdGuardToolPorts {
  readonly snapshot: () => AdGuardSnapshot;
  readonly client: () => AdGuardClient;
  readonly changed: () => void;
  readonly importRouterMonitor: () => Promise<void>;
}

function change(
  ports: AdGuardToolPorts,
  work: (client: AdGuardClient) => Promise<string>,
): Promise<HubToolResult> {
  return attemptTool(async () => {
    const done = await work(ports.client());
    ports.changed();
    return { done };
  });
}

export function adguardTools(ports: AdGuardToolPorts): PluginTool[] {
  return [
    ...readTools(ports),
    ...protectionTools(ports),
    ...filterTools(ports),
    ...ruleTools(ports),
    setupTool(ports),
  ];
}

function setupTool(ports: AdGuardToolPorts): PluginTool {
  return definePluginTool({
    name: 'setup_from_router_monitor',
    title: 'Use Router Monitor settings',
    description: "Copies the AdGuard Home address and sign-in from Konveyor's Router Monitor.",
    input: NO_INPUT,
    annotations: WRITE_HINTS,
    humanOnly: true,
    run: (_input, caller) =>
      ownerOnly(caller, 'Only the home owner can change the AdGuard Home setup', () =>
        attemptTool(async () => {
          await ports.importRouterMonitor();
          return { done: 'Router Monitor settings copied' };
        }),
      ),
  });
}

function readTools(ports: AdGuardToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'status',
      title: 'Ad blocking status',
      description:
        'Whether AdGuard Home protection is on or paused (and until when), its version, lookups and blocked lookups with blocked percent over the stats period, average answer time in ms, top looked-up and blocked domains, busiest clients and filter lists.',
      input: NO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: () => Promise.resolve(toolResult({ adguard: ports.snapshot() })),
    }),
    definePluginTool({
      name: 'query_log',
      title: 'Read the DNS query log',
      description:
        'Recent DNS lookups, newest first: domain, client, blocked/allowed/rewritten and the rule. Filter by search text and outcome; page with olderThan from the previous answer (up to 100 per page).',
      input: QUERY_LOG_REQUEST,
      annotations: READ_HINTS,
      humanOnly: false,
      run: (request) =>
        attemptTool(async () => ({ page: await readQueryLog(ports.client(), request) })),
    }),
    definePluginTool({
      name: 'client_info',
      title: 'Look up a DNS client',
      description:
        'What AdGuard Home knows about one client by IP, MAC, client id or name: its name, ids, own settings and lookups in the stats period.',
      input: z.strictObject({ client: z.string().trim().min(1).max(100) }),
      annotations: READ_HINTS,
      humanOnly: false,
      run: ({ client }) =>
        attemptTool(async () => ({
          client: await readClientInfo(ports.client(), client, ports.snapshot().stats),
        })),
    }),
  ];
}

function protectionTools(ports: AdGuardToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'resume_protection',
      title: 'Turn ad blocking on',
      description: 'Turns AdGuard Home protection back on for the whole network.',
      input: NO_INPUT,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: () => change(ports, (client) => changeProtection(client, { enabled: true })),
    }),
    definePluginTool({
      name: 'pause_protection',
      title: 'Pause ad blocking',
      description:
        'Pauses AdGuard Home protection for 1 to 1440 minutes; it turns itself back on afterwards.',
      input: z.strictObject({ minutes: PAUSE_MINUTES }),
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: ({ minutes }) =>
        change(ports, (client) => changeProtection(client, { enabled: false, minutes })),
    }),
    definePluginTool({
      name: 'turn_off_protection',
      title: 'Turn ad blocking off',
      description:
        'Turns AdGuard Home protection off with no end time; ads and trackers get through until it is turned back on.',
      input: NO_INPUT,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: () =>
        change(ports, (client) => changeProtection(client, { enabled: false, minutes: null })),
    }),
  ];
}

function filterTools(ports: AdGuardToolPorts): PluginTool[] {
  const filter = z.strictObject({ filterId: z.number().int() });
  return [
    definePluginTool({
      name: 'enable_filter',
      title: 'Turn a filter list on',
      description: 'Turns one AdGuard Home filter list (id from status) on.',
      input: filter,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: ({ filterId }) => change(ports, (client) => setFilterEnabled(client, filterId, true)),
    }),
    definePluginTool({
      name: 'disable_filter',
      title: 'Turn a filter list off',
      description:
        'Turns one AdGuard Home filter list (id from status) off; what it blocked gets through.',
      input: filter,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: ({ filterId }) => change(ports, (client) => setFilterEnabled(client, filterId, false)),
    }),
  ];
}

function ruleTools(ports: AdGuardToolPorts): PluginTool[] {
  const domain = z.strictObject({ domain: BLOCKABLE_DOMAIN });
  return [
    definePluginTool({
      name: 'block_domain',
      title: 'Block a domain',
      description: 'Adds a custom rule that blocks a domain and its subdomains for everyone.',
      input: domain,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: (input) => change(ports, (client) => setDomainRule(client, input.domain, 'block')),
    }),
    definePluginTool({
      name: 'allow_domain',
      title: 'Always allow a domain',
      description:
        'Adds a custom rule that always allows a domain and its subdomains, even when a filter list blocks it.',
      input: domain,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: (input) => change(ports, (client) => setDomainRule(client, input.domain, 'allow')),
    }),
    definePluginTool({
      name: 'remove_domain_rule',
      title: 'Remove a domain rule',
      description:
        'Removes the custom block or allow rule for a domain so the filter lists decide again.',
      input: domain,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: (input) => change(ports, (client) => setDomainRule(client, input.domain, 'remove')),
    }),
  ];
}
