import {
  SYNC_ACCEPT_COMMAND,
  SYNC_IGNORE_COMMAND,
  SYNC_PAUSE_COMMAND,
  SYNC_RESCAN_COMMAND,
  SYNC_RESOLVE_COMMAND,
  type SyncActivity,
  type SyncthingCommand,
  type SyncthingSnapshot,
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
  return [...readTools(ports), ...controlTools(ports), ...inviteTools(ports), setupTool(ports)];
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
        'Files added, changed or deleted and devices connecting, newest first (up to 200).',
      input: z.strictObject({
        limit: z.number().int().min(1).max(200).default(50),
        folderId: z.string().min(1).nullable().default(null),
      }),
      annotations: READ_HINTS,
      humanOnly: false,
      run: ({ limit, folderId }) => {
        const entries = ports
          .activity()
          .filter((entry) => folderId === null || entry.folderId === folderId);
        return Promise.resolve(toolResult({ activity: entries.slice(0, limit) }));
      },
    }),
  ];
}

function controlTools(ports: SyncthingToolPorts): PluginTool[] {
  const run = runner(ports);
  return [
    definePluginTool({
      name: 'set_paused',
      title: 'Pause or resume syncing',
      description:
        'Pauses or resumes one folder, one device, or (target kind all) syncing with every device. Use command set_paused.',
      input: SYNC_PAUSE_COMMAND,
      annotations: DANGER_HINTS,
      humanOnly: false,
      run,
    }),
    definePluginTool({
      name: 'rescan',
      title: 'Rescan folders',
      description:
        'Looks for changed files now in one folder, or in every folder when folderId is null. Use command rescan.',
      input: SYNC_RESCAN_COMMAND,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run,
    }),
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

function inviteTools(ports: SyncthingToolPorts): PluginTool[] {
  const run = runner(ports);
  return [
    definePluginTool({
      name: 'accept_invite',
      title: 'Accept a Syncthing invitation',
      description:
        'Adds a device that asked to connect, or a folder another device offered (path null uses Syncthing’s default folder location).',
      input: z.strictObject({ invite: SYNC_ACCEPT_COMMAND }),
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: ({ invite }) => run(invite),
    }),
    definePluginTool({
      name: 'ignore_invite',
      title: 'Ignore a Syncthing invitation',
      description: 'Stops a device or an offered folder from asking again.',
      input: z.strictObject({ invite: SYNC_IGNORE_COMMAND }),
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: ({ invite }) => run(invite),
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
