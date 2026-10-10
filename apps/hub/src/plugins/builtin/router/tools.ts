import {
  MAC_ADDRESS,
  ROUTER_CLIENT_CUTOFF,
  ROUTER_CLIENT_UPDATE,
  type KnownClient,
  type RouterCommand,
  type RouterSnapshot,
  type SpeedTestResult,
} from '@smarteverything/domain';
import { z } from 'zod';
import { failure, type HubToolResult } from '../../../ai-tools/hub-tool';
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

interface RouterToolPorts {
  readonly snapshot: () => RouterSnapshot;
  readonly knownClients: () => readonly KnownClient[];
  readonly assignClient: (mac: string, profileId: string | null) => KnownClient | null;
  readonly command: (command: RouterCommand) => Promise<string>;
  readonly speedTest: () => Promise<SpeedTestResult>;
  readonly speedTests: () => readonly SpeedTestResult[];
  readonly setPaused: (paused: boolean) => Promise<void>;
  readonly importRouterMonitor: () => Promise<void>;
}

const OWNER_ONLY = 'Only the home owner can change the router setup';

export function routerTools(ports: RouterToolPorts): PluginTool[] {
  return [
    ...readTools(ports),
    ...controlTools(ports),
    ...powerTools(ports),
    ...peopleTools(ports),
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
        'Every device the router knows: name, IP, MAC, Wi-Fi or wired, signal, traffic, who it belongs to, last seen.',
      input: z.strictObject({ onlineOnly: z.boolean().default(false) }),
      annotations: READ_HINTS,
      humanOnly: false,
      run: ({ onlineOnly }) => {
        const clients = ports
          .snapshot()
          .clients.filter((client) => !onlineOnly || client.connected);
        return Promise.resolve(toolResult({ clients }));
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

function presenceOf(
  known: readonly KnownClient[],
  who: { readonly profileId: string | null; readonly mac: string | null },
): Readonly<Record<string, unknown>> {
  const matches = known.filter((client) =>
    who.mac === null ? client.profileId === who.profileId : client.mac === who.mac,
  );
  return {
    onNetwork: matches.some((client) => client.present),
    devices: matches.map(({ mac, name, present, lastSeen }) => ({ mac, name, present, lastSeen })),
  };
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

function peopleTools(ports: RouterToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'is_on_network',
      title: 'Is someone home',
      description:
        'Whether a person (by profileId, through the devices assigned to them) or a MAC address is on the home network now.',
      input: z
        .strictObject({
          profileId: z.uuid().nullable().default(null),
          mac: MAC_ADDRESS.nullable().default(null),
        })
        .refine(
          (who) => (who.profileId === null) !== (who.mac === null),
          'Give either profileId or mac',
        ),
      annotations: READ_HINTS,
      humanOnly: false,
      run: (input) => Promise.resolve(toolResult(presenceOf(ports.knownClients(), input))),
    }),
    definePluginTool({
      name: 'assign_client',
      title: 'Say whose device this is',
      description:
        'Links a network device to a person (or clears it) so "is someone home" works for them.',
      input: z.strictObject({ mac: MAC_ADDRESS, profileId: z.uuid().nullable() }),
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: ({ mac, profileId }) => {
        const client = ports.assignClient(mac, profileId);
        return Promise.resolve(
          client === null
            ? failure('The router has never seen that device')
            : toolResult({ client }),
        );
      },
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
