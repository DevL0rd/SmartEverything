import {
  SYNC_RESOLVE_COMMAND,
  type SyncActivity,
  type SyncthingCommand,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
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
import { ACTIVITY_DEFAULT, ACTIVITY_INPUT, automationTools } from './automation-tools';

interface SyncthingToolPorts {
  readonly snapshot: () => SyncthingSnapshot;
  readonly activity: () => readonly SyncActivity[];
  readonly command: (command: SyncthingCommand) => Promise<string>;
  readonly importLocal: () => Promise<void>;
}

function runner(ports: SyncthingToolPorts): (command: SyncthingCommand) => Promise<HubToolResult> {
  return (command) => attemptTool(async () => ({ done: await ports.command(command) }));
}

export function syncthingTools(ports: SyncthingToolPorts): PluginTool[] {
  return [...readTools(ports), ...controlTools(ports), ...automationTools(ports), setupTool(ports)];
}

function readTools(ports: SyncthingToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'status',
      title: 'Syncthing status',
      description:
        'Overall sync health, every folder (percent done, bytes left, errors), every device (online, percent, transfer rates in bytes/s), invitations and what needs attention.',
      input: NO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: () => Promise.resolve(toolResult({ syncthing: ports.snapshot() })),
    }),
    definePluginTool({
      name: 'activity',
      title: 'Recent file activity',
      description:
        'Files added, changed or deleted and devices connecting, newest first. Every entry Syncthing kept; limit defaults to 50.',
      input: ACTIVITY_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: ({ limit = ACTIVITY_DEFAULT, folderId = null }) => {
        const shown = ports
          .activity()
          .filter((entry) => folderId === null || entry.folderId === folderId)
          .slice(0, limit);
        return Promise.resolve(toolResult({ activity: shown, count: shown.length }));
      },
    }),
  ];
}

function controlTools(ports: SyncthingToolPorts): PluginTool[] {
  const run = runner(ports);
  return [
    definePluginTool({
      name: 'resolve_folder',
      title: 'Override or revert a folder',
      description:
        'command override (send-only folder): this computer’s files win everywhere. command revert (receive-only folder): undo local changes.',
      input: SYNC_RESOLVE_COMMAND,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run,
    }),
  ];
}

function setupTool(ports: SyncthingToolPorts): PluginTool {
  return definePluginTool({
    name: 'setup_from_this_computer',
    title: 'Use Syncthing on this computer',
    description: 'Finds Syncthing for this computer’s user and copies its address and API key.',
    input: NO_INPUT,
    annotations: WRITE_HINTS,
    humanOnly: true,
    run: (_input, caller) =>
      ownerOnly(caller, 'Only the home owner can set up Syncthing', () =>
        attemptTool(async () => {
          await ports.importLocal();
          return { done: 'Syncthing found and connected' };
        }),
      ),
  });
}
