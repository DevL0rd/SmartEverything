import { z } from 'zod';

export const CAMERA_NOTIFICATION_KINDS = [
  'motion',
  'person',
  'pet',
  'sound',
  'baby_cry',
  'doorbell',
  'alarm',
  'offline',
  'clip_ready',
] as const;

export type CameraNotificationKind = (typeof CAMERA_NOTIFICATION_KINDS)[number];

export const CAMERA_NOTIFICATION_LABELS: Readonly<Record<CameraNotificationKind, string>> = {
  motion: 'Motion',
  person: 'Person',
  pet: 'Pet',
  sound: 'Sound',
  baby_cry: 'Baby crying',
  doorbell: 'Doorbell and calls',
  alarm: 'Nobody seen for a long time',
  offline: 'Camera offline',
  clip_ready: 'Clip ready',
};

export const CAMERA_NOTIFICATION_HINTS: Readonly<Record<CameraNotificationKind, string>> = {
  motion: 'The camera sees something move',
  person: 'The camera sees a person',
  pet: 'The camera sees a pet',
  sound: 'The camera hears an unusual or loud sound',
  baby_cry: 'The camera hears a baby crying',
  doorbell: 'Someone rings or calls from the camera',
  alarm: 'The camera has seen nobody for a long time',
  offline:
    'One notice, at most once an hour, until it is back; failed snapshots and clips never add more',
  clip_ready: 'A new event clip is saved on your server',
};

export const CAMERA_NOTIFICATION_DEFAULTS: Readonly<Record<CameraNotificationKind, boolean>> = {
  motion: false,
  person: false,
  pet: false,
  sound: false,
  baby_cry: true,
  doorbell: true,
  alarm: false,
  offline: true,
  clip_ready: false,
};

export const CAMERA_OFFLINE_REPEAT_MINUTES = 60;

export const CAMERA_COOLDOWN_DEFAULT_MINUTES = 2;

export const CAMERA_COOLDOWN_CHOICES = [0, 1, 2, 5, 10, 30, 60] as const;

const KIND_FLAGS = z.strictObject({
  motion: z.boolean(),
  person: z.boolean(),
  pet: z.boolean(),
  sound: z.boolean(),
  baby_cry: z.boolean(),
  doorbell: z.boolean(),
  alarm: z.boolean(),
  offline: z.boolean(),
  clip_ready: z.boolean(),
});

const KIND_OVERRIDES = KIND_FLAGS.partial();

const CLOCK = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const CAMERA_QUIET_HOURS = z.strictObject({ from: CLOCK, to: CLOCK });

export type CameraQuietHours = z.infer<typeof CAMERA_QUIET_HOURS>;

const COOLDOWN_MINUTES = z.number().int().min(0).max(1440);

const CAMERA_OVERRIDE = z.strictObject({
  kinds: KIND_OVERRIDES,
  cooldownMinutes: COOLDOWN_MINUTES.nullable(),
  quiet: z.union([CAMERA_QUIET_HOURS, z.literal('off')]).nullable(),
});

export type CameraNotificationOverride = z.infer<typeof CAMERA_OVERRIDE>;

export const CAMERA_NOTIFICATIONS_PREF = z.strictObject({
  kinds: KIND_FLAGS.describe(
    'Which camera notices reach this person’s phones by default: motion, person, pet, sound, baby_cry, doorbell (rings and calls), alarm (nobody seen for a long time), offline, clip_ready',
  ),
  cooldownMinutes: COOLDOWN_MINUTES.describe(
    'Default minutes a camera stays silent for a kind after it notified (0 for no limit); offline repeats at most once an hour whatever this is',
  ),
  quiet: CAMERA_QUIET_HOURS.nullable().describe(
    'Quiet hours in the home time zone, from and to as HH:MM (may cross midnight); no camera notice reaches the phones in that time. null for none',
  ),
  cameras: z
    .record(z.string().min(1), CAMERA_OVERRIDE)
    .describe(
      'Per camera (id from device_find) overrides: kinds (only the ones that differ from the default), cooldownMinutes (null follows the default), quiet (null follows the default, "off" for none)',
    ),
});

export type CameraNotificationsPref = z.infer<typeof CAMERA_NOTIFICATIONS_PREF>;

export const NO_CAMERA_OVERRIDE: CameraNotificationOverride = {
  kinds: {},
  cooldownMinutes: null,
  quiet: null,
};

export const DEFAULT_CAMERA_NOTIFICATIONS: CameraNotificationsPref = {
  kinds: { ...CAMERA_NOTIFICATION_DEFAULTS },
  cooldownMinutes: CAMERA_COOLDOWN_DEFAULT_MINUTES,
  quiet: null,
  cameras: {},
};

export function cameraNotificationOverride(
  pref: CameraNotificationsPref,
  deviceId: string,
): CameraNotificationOverride {
  return pref.cameras[deviceId] ?? NO_CAMERA_OVERRIDE;
}

export function cameraNotificationOn(
  pref: CameraNotificationsPref,
  deviceId: string,
  kind: CameraNotificationKind,
): boolean {
  return cameraNotificationOverride(pref, deviceId).kinds[kind] ?? pref.kinds[kind];
}

export function cameraCooldownMinutes(pref: CameraNotificationsPref, deviceId: string): number {
  return cameraNotificationOverride(pref, deviceId).cooldownMinutes ?? pref.cooldownMinutes;
}

export function cameraQuietHours(
  pref: CameraNotificationsPref,
  deviceId: string,
): CameraQuietHours | null {
  const own = cameraNotificationOverride(pref, deviceId).quiet;
  if (own === null) {
    return pref.quiet;
  }
  return own === 'off' ? null : own;
}

function minutesOf(clock: string): number {
  const [hours = '0', minutes = '0'] = clock.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function inQuietHours(quiet: CameraQuietHours | null, minuteOfDay: number): boolean {
  if (quiet === null) {
    return false;
  }
  const from = minutesOf(quiet.from);
  const to = minutesOf(quiet.to);
  if (from === to) {
    return false;
  }
  return from < to
    ? minuteOfDay >= from && minuteOfDay < to
    : minuteOfDay >= from || minuteOfDay < to;
}

function prunedOverride(override: CameraNotificationOverride): CameraNotificationOverride | null {
  const plain =
    Object.keys(override.kinds).length === 0 &&
    override.cooldownMinutes === null &&
    override.quiet === null;
  return plain ? null : override;
}

function withOverride(
  pref: CameraNotificationsPref,
  deviceId: string,
  override: CameraNotificationOverride,
): CameraNotificationsPref {
  const others = Object.entries(pref.cameras).filter(([id]) => id !== deviceId);
  const kept = prunedOverride(override);
  return {
    ...pref,
    cameras: Object.fromEntries(kept === null ? others : [...others, [deviceId, kept]]),
  };
}

type KindOverrides = CameraNotificationOverride['kinds'];

function withKind(
  kinds: KindOverrides,
  kind: CameraNotificationKind,
  on: boolean | null,
): KindOverrides {
  const others = Object.entries(kinds).filter(([name]) => name !== kind);
  return KIND_OVERRIDES.parse(Object.fromEntries(on === null ? others : [...others, [kind, on]]));
}

export function withCameraNotification(
  pref: CameraNotificationsPref,
  deviceId: string,
  kind: CameraNotificationKind,
  on: boolean,
): CameraNotificationsPref {
  const current = cameraNotificationOverride(pref, deviceId);
  const kinds = withKind(current.kinds, kind, on === pref.kinds[kind] ? null : on);
  return withOverride(pref, deviceId, { ...current, kinds });
}

export function withCameraCooldown(
  pref: CameraNotificationsPref,
  deviceId: string,
  minutes: number | null,
): CameraNotificationsPref {
  return withOverride(pref, deviceId, {
    ...cameraNotificationOverride(pref, deviceId),
    cooldownMinutes: minutes,
  });
}

export function withCameraQuiet(
  pref: CameraNotificationsPref,
  deviceId: string,
  quiet: CameraQuietHours | 'off' | null,
): CameraNotificationsPref {
  return withOverride(pref, deviceId, { ...cameraNotificationOverride(pref, deviceId), quiet });
}
