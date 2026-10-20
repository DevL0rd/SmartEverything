import {
  ROUTER_CLIENT_CUTOFF,
  ROUTER_CLIENT_UPDATE,
  type NetworkClient,
  type RouterCommand,
  type RouterSnapshot,
  type SpeedTestResult,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { HubToolResult } from '../../../ai-tools/hub-tool';
import { OFFSET, moreOf, paged } from '../../../ai-tools/paging';
import type { PluginTool } from '../contract';
import type { PeopleControls } from './people-controls';
import { peopleTools } from './people-tools';
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

interface RouterToolPorts {
  readonly snapshot: () => RouterSnapshot;
  readonly people: PeopleControls;
  readonly command: (command: RouterCommand) => Promise<string>;
  readonly speedTest: () => Promise<SpeedTestResult>;
  readonly speedTests: () => readonly SpeedTestResult[];
  readonly setPaused: (paused: boolean) => Promise<void>;
  readonly importRouterMonitor: () => Promise<void>;
}

const OWNER_ONLY = 'Only the home owner can change the router setup';

const CLIENT_FILTER = z.strictObject({
  onlineOnly: z.boolean().default(false),
  search: z.string().min(1).max(100).optional().describe('Words in the name, IP or MAC'),
  limit: z.number().int().min(1).max(500).default(300),
  offset: OFFSET,
});

function clientMatches(search: string, client: NetworkClient): boolean {
  const fields = [client.name, client.ip ?? '', client.mac].map((field) => field.toLowerCase());
  return search
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '')
    .every((word) => fields.some((field) => field.includes(word)));
}

export function routerTools(ports: RouterToolPorts): PluginTool[] {
  return [
    ...readTools(ports),
    ...controlTools(ports),
    ...powerTools(ports),
    ...peopleTools(ports.people),
    ...setupTools(ports),
  ];
}

function readTools(ports: RouterToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'status',
      title: 'Router status',
      description: 'Internet connection, speeds, latency, router load and Wi-Fi radios right now.',
      input: NO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: () => {
        const { clients: _clients, stations: _stations, ...rest } = ports.snapshot();
        return Promise.resolve(toolResult({ router: rest }));
      },
    }),
    definePluginTool({
      name: 'list_clients',
      title: 'Devices on the network',
      description:
        'Devices the router knows, filtered by words or online state: name, IP, MAC, Wi-Fi or wired, signal, traffic, who it belongs to, last seen. A partial list has more with the total and next_offset.',
      input: CLIENT_FILTER,
      annotations: READ_HINTS,
      humanOnly: false,
      run: ({ onlineOnly, search, limit, offset }) => {
        const clients = ports
          .snapshot()
          .clients.filter(
            (client) =>
              (!onlineOnly || client.connected) &&
              (search === undefined || clientMatches(search, client)),
          );
        const { rows, more } = paged(clients, offset, limit);
        return Promise.resolve(toolResult({ clients: rows, ...moreOf(more) }));
      },
    }),
    definePluginTool({
      name: 'list_speed_tests',
      title: 'Speed test history',
      description: 'The last 20 internet speed tests, newest first.',
      input: NO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: () => Promise.resolve(toolResult({ tests: ports.speedTests() })),
    }),
  ];
}

function controlTools(ports: RouterToolPorts): PluginTool[] {
  const command = (value: RouterCommand): Promise<HubToolResult> =>
    attemptTool(async () => ({ done: await ports.command(value) }));
  return [
    definePluginTool({
      name: 'run_speed_test',
      title: 'Run a speed test',
      description:
        'Measures download, upload, latency and jitter against Cloudflare (about 20 seconds).',
      input: NO_INPUT,
      annotations: { ...WRITE_HINTS, openWorldHint: true },
      humanOnly: false,
      run: () => attemptTool(async () => ({ result: await ports.speedTest() })),
    }),
    definePluginTool({
      name: 'cut_off_client',
      title: 'Disconnect or block a device',
      description:
        'Kicks a device off Wi-Fi (it may reconnect) or blocks its internet access until unblocked.',
      input: z.strictObject({ client: ROUTER_CLIENT_CUTOFF }),
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: ({ client }) => command({ command: 'client', client }),
    }),
    definePluginTool({
      name: 'update_client',
      title: 'Unblock, rename or reserve an IP',
      description:
        'Gives a blocked device its internet back, renames it on the router (1–32 characters) or reserves its IPv4 address.',
      input: z.strictObject({ client: ROUTER_CLIENT_UPDATE }),
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: ({ client }) => command({ command: 'client', client }),
    }),
  ];
}

function powerTools(ports: RouterToolPorts): PluginTool[] {
  const command = (value: RouterCommand): Promise<HubToolResult> =>
    attemptTool(async () => ({ done: await ports.command(value) }));
  return [
    definePluginTool({
      name: 'restart_wifi',
      title: 'Restart Wi-Fi',
      description: 'Restarts every Wi-Fi radio. Everyone on Wi-Fi drops for about a minute.',
      input: NO_INPUT,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: () => command({ command: 'restart_wifi' }),
    }),
    definePluginTool({
      name: 'reboot',
      title: 'Restart the router',
      description: 'Restarts the router. The whole home is offline for a few minutes.',
      input: NO_INPUT,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: () => command({ command: 'reboot' }),
    }),
  ];
}

function setupTools(ports: RouterToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'set_paused',
      title: 'Pause router monitoring',
      description: 'Stops or resumes all traffic to the router.',
      input: z.strictObject({ paused: z.boolean() }),
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: ({ paused }, caller) =>
        ownerOnly(caller, OWNER_ONLY, () =>
          attemptTool(async () => {
            await ports.setPaused(paused);
            return { paused };
          }),
        ),
    }),
    definePluginTool({
      name: 'setup_from_router_monitor',
      title: 'Use Router Monitor settings',
      description: "Copies the router address and SSH key from Konveyor's Router Monitor.",
      input: NO_INPUT,
      annotations: WRITE_HINTS,
      humanOnly: true,
      run: (_input, caller) =>
        ownerOnly(caller, OWNER_ONLY, () =>
          attemptTool(async () => {
            await ports.importRouterMonitor();
            return { done: 'Router Monitor settings copied' };
          }),
        ),
    }),
  ];
}
