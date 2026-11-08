import type { SyncTarget, SyncthingCommand, SyncthingSnapshot } from '@smarteverything/domain';
import { z } from 'zod';
import { failure, type HubToolResult } from '../../../ai-tools/hub-tool';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { attemptTool, DANGER_HINTS, WRITE_HINTS } from '../tool-kit';
import { ACTIVITY_KEPT } from './sync-monitor';

export const PAUSE_SCOPES = ['everything', 'folder', 'peer'] as const;
export const INVITE_ANSWERS = ['accept', 'ignore'] as const;
export const DEVICE_INVITE_PREFIX = 'device:';
export const FOLDER_INVITE_PREFIX = 'folder:';

export interface AutomationToolPorts {
  readonly snapshot: () => SyncthingSnapshot;
  readonly command: (command: SyncthingCommand) => Promise<string>;
}

export const PAUSE_INPUT = z.strictObject({
  what: z.enum(PAUSE_SCOPES),
  folderId: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  paused: z.boolean(),
});

export const ACTIVITY_DEFAULT = 50;

export const ACTIVITY_INPUT = z.strictObject({
  limit: z.number().int().min(1).max(ACTIVITY_KEPT).optional(),
  folderId: z.string().min(1).nullable().optional(),
});

export const RESCAN_INPUT = z.strictObject({ folderId: z.string().min(1).optional() });

export const INVITE_INPUT = z.strictObject({
  invite: z.string().min(1),
  answer: z.enum(INVITE_ANSWERS),
  path: z.string().trim().min(1).max(1000).optional(),
});

export const PAUSE_TOOL = { name: 'pause_syncing', input: PAUSE_INPUT };
export const RESCAN_TOOL = { name: 'rescan_folder', input: RESCAN_INPUT };
export const ACTIVITY_TOOL = { name: 'activity', input: ACTIVITY_INPUT };
export const INVITE_TOOL = { name: 'answer_invitation', input: INVITE_INPUT };

function refused(message: string): HubToolResult {
  return failure(message, { code: 'invalid_arguments' });
}

function targetOf(input: z.output<typeof PAUSE_INPUT>): SyncTarget | string {
  switch (input.what) {
    case 'everything':
      return { kind: 'all' };
    case 'folder':
      return input.folderId === undefined
        ? 'Choose the folder to pause or resume'
        : { kind: 'folder', id: input.folderId };
    case 'peer':
      return input.deviceId === undefined
        ? 'Choose the sync device to pause or resume'
        : { kind: 'device', id: input.deviceId };
  }
}

function pauseTool(ports: AutomationToolPorts): PluginTool {
  return definePluginTool({
    ...PAUSE_TOOL,
    title: 'Pause or resume syncing',
    description:
      'Pauses or resumes syncing with every device, one folder (folderId) or one sync device (deviceId), chosen by what.',
    annotations: DANGER_HINTS,
    humanOnly: false,
    run: (input) => {
      const target = targetOf(input);
      if (typeof target === 'string') return Promise.resolve(refused(target));
      return attemptTool(async () => ({
        done: await ports.command({ command: 'set_paused', target, paused: input.paused }),
      }));
    },
  });
}

function rescanTool(ports: AutomationToolPorts): PluginTool {
  return definePluginTool({
    ...RESCAN_TOOL,
    title: 'Rescan folders',
    description:
      'Looks for changed files now in one folder, or in every folder when none is given.',
    annotations: WRITE_HINTS,
    humanOnly: false,
    run: ({ folderId }) =>
      attemptTool(async () => ({
        done: await ports.command({ command: 'rescan', folderId: folderId ?? null }),
      })),
  });
}

export type InviteRef =
  | { readonly kind: 'device'; readonly id: string }
  | { readonly kind: 'folder'; readonly id: string };

export function inviteRefOf(invite: string): InviteRef | null {
  if (invite.startsWith(DEVICE_INVITE_PREFIX)) {
    return { kind: 'device', id: invite.slice(DEVICE_INVITE_PREFIX.length) };
  }
  if (invite.startsWith(FOLDER_INVITE_PREFIX)) {
    return { kind: 'folder', id: invite.slice(FOLDER_INVITE_PREFIX.length) };
  }
  return null;
}

function inviteCommand(
  ref: InviteRef,
  answer: (typeof INVITE_ANSWERS)[number],
  path: string | null,
  snapshot: SyncthingSnapshot,
): SyncthingCommand | string {
  if (ref.kind === 'folder') {
    const offered = snapshot.pendingFolders.some((folder) => folder.id === ref.id);
    if (!offered) return 'That folder is no longer offered';
    return answer === 'accept'
      ? { command: 'accept_folder', folderId: ref.id, path }
      : { command: 'ignore_folder', folderId: ref.id };
  }
  const asking = snapshot.pendingDevices.find((device) => device.id === ref.id);
  if (asking === undefined) return 'That device is no longer asking to connect';
  return answer === 'accept'
    ? { command: 'accept_device', deviceId: ref.id, name: asking.name }
    : { command: 'ignore_device', deviceId: ref.id };
}

function inviteTool(ports: AutomationToolPorts): PluginTool {
  return definePluginTool({
    ...INVITE_TOOL,
    title: 'Answer a Syncthing invitation',
    description:
      'Accepts or ignores a device that asked to connect or a folder another device offered. The invitation is device:<id> or folder:<id>; an accepted folder goes to Syncthing’s default location unless path is given.',
    annotations: DANGER_HINTS,
    humanOnly: false,
    run: ({ invite, answer, path }) => {
      const ref = inviteRefOf(invite);
      if (ref === null) return Promise.resolve(refused('That is not a Syncthing invitation'));
      const command = inviteCommand(ref, answer, path ?? null, ports.snapshot());
      if (typeof command === 'string') return Promise.resolve(refused(command));
      return attemptTool(async () => ({ done: await ports.command(command) }));
    },
  });
}

export function automationTools(ports: AutomationToolPorts): PluginTool[] {
  return [pauseTool(ports), rescanTool(ports), inviteTool(ports)];
}
