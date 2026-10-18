import { z } from 'zod';
import type { StandardCapability } from './capabilities';
import { FILE_PATH } from './node/computer-files';

export const MACHINE_ACTIONS = [
  'ring',
  'stop_ring',
  'flashlight',
  'launch_app',
  'open',
  'screenshot',
  'lock',
  'unlock',
  'show_unlock',
  'receive_file',
] as const;

export type MachineAction = (typeof MACHINE_ACTIONS)[number];

export const MACHINE_ACTION = z.enum(MACHINE_ACTIONS);

export const MACHINE_ACTION_CAPABILITY: Readonly<Record<MachineAction, StandardCapability | null>> =
  {
    ring: 'ring',
    stop_ring: 'stop_ring',
    flashlight: 'flashlight',
    launch_app: 'launch_app',
    open: 'open',
    screenshot: null,
    lock: 'lock_screen',
    unlock: 'unlock',
    show_unlock: 'show_unlock',
    receive_file: null,
  };

export const MACHINE_ACTION_RISK: Readonly<Record<MachineAction, 'plain' | 'confirm'>> = {
  ring: 'plain',
  stop_ring: 'plain',
  flashlight: 'plain',
  launch_app: 'plain',
  open: 'plain',
  screenshot: 'plain',
  lock: 'plain',
  unlock: 'confirm',
  show_unlock: 'plain',
  receive_file: 'plain',
};

export const MACHINE_PERMISSION_IDS = [
  'android_accessibility',
  'android_overlay',
  'android_dnd',
  'android_notification_listener',
  'android_files',
  'android_usage_access',
  'android_write_settings',
  'android_bluetooth',
  'android_location',
  'android_activity_recognition',
  'android_phone_state',
  'mac_screen_recording',
  'mac_accessibility',
  'mac_automation',
  'mac_full_disk',
  'linux_portal_screenshot',
  'linux_linger',
  'windows_firewall',
] as const;

export type MachinePermissionId = (typeof MACHINE_PERMISSION_IDS)[number];

export const MACHINE_PERMISSION_ID = z.enum(MACHINE_PERMISSION_IDS);

export type MachinePlatform = 'android' | 'linux' | 'windows' | 'macos';

export type MachineGrantKind = 'system_settings' | 'run_once' | 'file_picker' | 'elevation';

export interface MachinePermission {
  readonly label: string;
  readonly platform: MachinePlatform;
  readonly grant: MachineGrantKind;
}

export const MACHINE_PERMISSIONS: Readonly<Record<MachinePermissionId, MachinePermission>> = {
  android_accessibility: {
    label: 'SmartEverything accessibility service',
    platform: 'android',
    grant: 'system_settings',
  },
  android_overlay: {
    label: 'Display over other apps',
    platform: 'android',
    grant: 'system_settings',
  },
  android_dnd: { label: 'Do Not Disturb access', platform: 'android', grant: 'system_settings' },
  android_notification_listener: {
    label: 'Notification access',
    platform: 'android',
    grant: 'system_settings',
  },
  android_files: { label: 'Folder access', platform: 'android', grant: 'file_picker' },
  android_usage_access: {
    label: 'App usage access',
    platform: 'android',
    grant: 'system_settings',
  },
  android_write_settings: {
    label: 'Modify system settings',
    platform: 'android',
    grant: 'system_settings',
  },
  android_bluetooth: { label: 'Nearby devices', platform: 'android', grant: 'system_settings' },
  android_location: { label: 'Location', platform: 'android', grant: 'system_settings' },
  android_activity_recognition: {
    label: 'Physical activity',
    platform: 'android',
    grant: 'system_settings',
  },
  android_phone_state: { label: 'Phone state', platform: 'android', grant: 'system_settings' },
  mac_screen_recording: { label: 'Screen Recording', platform: 'macos', grant: 'system_settings' },
  mac_accessibility: { label: 'Accessibility', platform: 'macos', grant: 'system_settings' },
  mac_automation: { label: 'Automation', platform: 'macos', grant: 'system_settings' },
  mac_full_disk: { label: 'Full Disk Access', platform: 'macos', grant: 'system_settings' },
  linux_portal_screenshot: {
    label: 'Screenshot permission',
    platform: 'linux',
    grant: 'run_once',
  },
  linux_linger: { label: 'Run while signed out', platform: 'linux', grant: 'elevation' },
  windows_firewall: { label: 'Firewall rule', platform: 'windows', grant: 'elevation' },
};

const SUPPORT_REASON = z.string().trim().min(1).max(200);

export const MACHINE_ACTION_SUPPORT = z.discriminatedUnion('state', [
  z.strictObject({ action: MACHINE_ACTION, state: z.literal('ready') }),
  z.strictObject({
    action: MACHINE_ACTION,
    state: z.literal('needs_permission'),
    permission: MACHINE_PERMISSION_ID,
    reason: SUPPORT_REASON,
  }),
  z.strictObject({
    action: MACHINE_ACTION,
    state: z.literal('unsupported'),
    reason: SUPPORT_REASON,
  }),
]);

export type MachineActionSupport = z.infer<typeof MACHINE_ACTION_SUPPORT>;

export const MACHINE_ACTION_SUPPORTS = z
  .array(MACHINE_ACTION_SUPPORT)
  .refine((list) => new Set(list.map((support) => support.action)).size === list.length, {
    message: 'each action is reported once',
  });

export const MACHINE_PERMISSION_STATE = z.strictObject({
  permission: MACHINE_PERMISSION_ID,
  granted: z.boolean(),
});

export type MachinePermissionState = z.infer<typeof MACHINE_PERMISSION_STATE>;

export const MACHINE_PERMISSION_STATES = z
  .array(MACHINE_PERMISSION_STATE)
  .refine((list) => new Set(list.map((state) => state.permission)).size === list.length, {
    message: 'each permission is reported once',
  });

export const MACHINE_OPEN_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('url'),
    url: z.url({ protocol: /^(https?|mailto|tel)$/ }),
  }),
  z.strictObject({ kind: z.literal('path'), path: FILE_PATH }),
]);

export type MachineOpenTarget = z.infer<typeof MACHINE_OPEN_TARGET>;

export class MachineOpenTargetError extends Error {
  override readonly name = 'MachineOpenTargetError';

  constructor(readonly received: string) {
    super(
      `Expected a web, mail or phone link or an absolute file path to open, received "${received}".`,
    );
  }
}

export function machineOpenTargetOf(text: string): MachineOpenTarget {
  const path = FILE_PATH.safeParse(text);
  if (path.success) {
    return { kind: 'path', path: path.data };
  }
  const url = MACHINE_OPEN_TARGET.safeParse({ kind: 'url', url: text.trim() });
  if (url.success) {
    return url.data;
  }
  throw new MachineOpenTargetError(text);
}

export function reportedMachineActions(
  supports: readonly MachineActionSupport[],
): readonly MachineActionSupport[] {
  return supports.filter((support) => support.state !== 'unsupported');
}

export function machineActionOfCapability(capability: string): MachineAction | null {
  return MACHINE_ACTIONS.find((action) => MACHINE_ACTION_CAPABILITY[action] === capability) ?? null;
}

export function machineActionRefusal(
  supports: readonly MachineActionSupport[],
  action: MachineAction,
): string | null {
  const support = supports.find((item) => item.action === action);
  if (support === undefined) {
    return `This machine has not reported that it can ${action.replaceAll('_', ' ')}.`;
  }
  switch (support.state) {
    case 'ready':
      return null;
    case 'needs_permission':
      return `${support.reason} Grant "${MACHINE_PERMISSIONS[support.permission].label}" on that machine.`;
    case 'unsupported':
      return support.reason;
  }
}
