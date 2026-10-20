import { z } from 'zod';
import { JSON_VALUE } from './values';

export const EVENT_KINDS = [
  'doorbell',
  'call',
  'motion',
  'no_motion',
  'person',
  'sound',
  'alarm',
  'button',
  'leak',
  'smoke',
  'device_online',
  'device_offline',
  'automation_run',
  'provider_error',
  'pet',
  'opened',
  'maintenance',
  'fault',
  'activity',
  'cycle_finished',
  'computer_power',
  'machine_action',
  'phone_context_changed',
  'place_arrived',
  'place_left',
  'parked',
  'phone_unlocked',
  'zone_enter',
  'zone_leave',
  'app_opened',
  'app_closed',
  'app_focused',
  'app_unfocused',
  'signal',
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const CAMERA_DETECTION_KINDS = {
  person: 'person',
  pet: 'pet',
  motion: 'motion',
  baby_cry: 'sound',
  abnormal_sound: 'sound',
  loud_sound: 'sound',
  doorbell: 'doorbell',
  call: 'call',
} as const satisfies Readonly<Record<string, EventKind>>;

export type CameraDetection = keyof typeof CAMERA_DETECTION_KINDS;

export function cameraDetectionsOf(kind: EventKind): readonly CameraDetection[] {
  return Object.entries(CAMERA_DETECTION_KINDS).flatMap(([detection, detected]) =>
    detected === kind && isCameraDetection(detection) ? [detection] : [],
  );
}

export function isCameraDetection(name: string): name is CameraDetection {
  return Object.hasOwn(CAMERA_DETECTION_KINDS, name);
}

export function cameraDetectionOf(
  kind: EventKind,
  details: Readonly<Record<string, unknown>>,
): CameraDetection | null {
  const detection = details['detection'];
  return typeof detection === 'string' &&
    isCameraDetection(detection) &&
    CAMERA_DETECTION_KINDS[detection] === kind
    ? detection
    : null;
}

const MIOT_DEVICE_EVENTS: Readonly<Record<string, EventKind>> = {
  'people-fence-in': 'person',
  'people-fence-out': 'person',
  'door-opened': 'opened',
  'top-grille': 'opened',
  'filter-exhausted': 'maintenance',
  'low-water-level': 'maintenance',
  'fault-motor-stuck': 'fault',
  'childlock-trigger': 'button',
  'cruise-started': 'activity',
  'cruise-ended': 'activity',
  'into-fav-area': 'activity',
  'out-fav-area': 'activity',
  'ir-turned-on': 'activity',
  'ir-turned-off': 'activity',
  'self-check-complete': 'activity',
  'long-time-no-humang': 'alarm',
  'no-huamn-appear': 'alarm',
  click: 'button',
  'double-click': 'button',
  'long-press': 'button',
  'low-battery': 'maintenance',
  'someone-move': 'motion',
  'nobody-move': 'no_motion',
  'auto-light': 'activity',
  'auto-fragrance': 'activity',
};

export const LAUNDRY_MIOT_EVENTS = {
  washEnd: 'wash-end',
  cleanCompleted: 'clean-completed',
  washEndLog: 'wash-end-log',
} as const;

export function miotDeviceEventKind(name: string): EventKind | null {
  return Object.entries(MIOT_DEVICE_EVENTS).find(([event]) => event === name)?.[1] ?? null;
}

export function miotDeviceEventsOf(kind: EventKind): readonly string[] {
  return Object.entries(MIOT_DEVICE_EVENTS).flatMap(([name, mapped]) =>
    mapped === kind ? [name] : [],
  );
}

export const DEVICE_EVENT = z.object({
  externalId: z.string().min(1),
  kind: z.enum(EVENT_KINDS),
  occurredAt: z.iso.datetime({ offset: true }),
  details: z.record(z.string(), JSON_VALUE),
  occurrence: z.string().min(1).optional(),
});

export type DeviceEvent = z.infer<typeof DEVICE_EVENT>;

const URGENT: ReadonlySet<EventKind> = new Set(['doorbell', 'call', 'alarm', 'leak', 'smoke']);

export function isUrgent(kind: EventKind): boolean {
  return URGENT.has(kind);
}

export function pushedMessageOf(
  kind: EventKind,
  details: Readonly<Record<string, unknown>>,
): string | null {
  const message = details['message'];
  return kind === 'automation_run' && typeof message === 'string' && message !== ''
    ? message
    : null;
}

export function isPushed(kind: EventKind, details: Readonly<Record<string, unknown>>): boolean {
  return isUrgent(kind) || pushedMessageOf(kind, details) !== null;
}
