import type { AdGuardSnapshot } from '@smarteverything/domain';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { attemptTool, NO_INPUT, ownerOnly, READ_HINTS, toolResult, WRITE_HINTS } from '../tool-kit';
import type { AdGuardClient } from './adguard-client';
import { automationTools, CLIENT_INFO_INPUT } from './automation-tools';
import { readClientInfo } from './controls';

export interface AdGuardToolPorts {
  readonly snapshot: () => AdGuardSnapshot;
  readonly client: () => AdGuardClient;
  readonly changed: () => void;
  readonly importRouterMonitor: () => Promise<void>;
}

export function adguardTools(ports: AdGuardToolPorts): PluginTool[] {
  return [
    ...readTools(ports),
    ...automationTools({ client: ports.client, changed: ports.changed }),
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
      name: 'client_info',
      title: 'Look up a DNS client',
      description:
        'What AdGuard Home knows about one client by IP, MAC, client id or name: its name, ids, own settings and lookups in the stats period.',
      input: CLIENT_INFO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: ({ client }) =>
        attemptTool(async () => ({
          client: await readClientInfo(ports.client(), client, ports.snapshot().stats),
        })),
    }),
  ];
}
