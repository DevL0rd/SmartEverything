import {
  MAC_ADDRESS,
  ROUTER_CLIENT_UPDATE,
  type RouterCommand,
  type RouterSnapshot,
} from '@smarteverything/domain';
import { z } from 'zod';
import { failure, type HubToolResult } from '../../../ai-tools/hub-tool';
import { CURSOR } from '../../../ai-tools/paging';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { attemptTool, DANGER_HINTS, NO_INPUT } from '../tool-kit';

export const NOT_SET_UP = 'not_set_up';

export const RESTART_TARGETS = ['wifi', 'router'] as const;

export const CLIENT_ACCESS_ACTIONS = ['disconnect', 'block', 'unblock'] as const;

export const CLIENT_ACCESS_INPUT = z.strictObject({
  client: z.strictObject({ action: z.enum(CLIENT_ACCESS_ACTIONS), mac: MAC_ADDRESS }),
});

export const RESTART_INPUT = z.strictObject({ what: z.enum(RESTART_TARGETS) });

export const LIST_CLIENTS_INPUT = z.strictObject({
  onlineOnly: z.boolean().optional(),
  search: z.string().min(1).max(100).optional().describe('Words in the name, IP or MAC'),
  person: z.uuid().optional().describe('Only the devices linked to this person'),
  limit: z.number().int().min(1).max(500).optional(),
  cursor: CURSOR,
});

export const UPDATE_CLIENT_INPUT = z.strictObject({ client: ROUTER_CLIENT_UPDATE });

export const CLIENT_ACCESS_TOOL = { name: 'client_access', input: CLIENT_ACCESS_INPUT };
export const RESTART_TOOL = { name: 'restart', input: RESTART_INPUT };
export const LIST_CLIENTS_TOOL = { name: 'list_clients', input: LIST_CLIENTS_INPUT };
export const LIST_SPEED_TESTS_TOOL = { name: 'list_speed_tests', input: NO_INPUT };
export const RUN_SPEED_TEST_TOOL = { name: 'run_speed_test', input: NO_INPUT };
export const UPDATE_CLIENT_TOOL = { name: 'update_client', input: UPDATE_CLIENT_INPUT };

export interface AutomationToolPorts {
  readonly snapshot: () => RouterSnapshot;
  readonly command: (command: RouterCommand) => Promise<string>;
}

const RESTART_COMMANDS: Readonly<Record<(typeof RESTART_TARGETS)[number], RouterCommand>> = {
  wifi: { command: 'restart_wifi' },
  router: { command: 'reboot' },
};

export function setUpOrRefusal(ports: Pick<AutomationToolPorts, 'snapshot'>): HubToolResult | null {
  return ports.snapshot().connection.state === 'not_set_up'
    ? failure('The router is not set up yet. Add its address in the plugin settings.', {
        code: NOT_SET_UP,
      })
    : null;
}

function runCommand(ports: AutomationToolPorts, command: RouterCommand): Promise<HubToolResult> {
  const refusal = setUpOrRefusal(ports);
  if (refusal !== null) return Promise.resolve(refusal);
  return attemptTool(async () => ({ done: await ports.command(command) }));
}

export function automationTools(ports: AutomationToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: CLIENT_ACCESS_TOOL.name,
      title: 'Change a device’s network access',
      description:
        'Disconnects a device from Wi-Fi (it may reconnect), blocks its internet access until unblocked, or gives a blocked device its access back. The device is its MAC address.',
      input: CLIENT_ACCESS_INPUT,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: ({ client }) => runCommand(ports, { command: 'client', client }),
    }),
    definePluginTool({
      name: RESTART_TOOL.name,
      title: 'Restart Wi-Fi or the router',
      description:
        'Restarts every Wi-Fi radio (everyone on Wi-Fi drops for about a minute) or the whole router (the home is offline for a few minutes).',
      input: RESTART_INPUT,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: ({ what }) => runCommand(ports, RESTART_COMMANDS[what]),
    }),
  ];
}
