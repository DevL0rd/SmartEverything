import { cameraDetectionOf, type CameraDetection, type EventKind } from './events';

interface CameraDetectionPresentation {
  readonly label: string;
  readonly keywords: readonly string[];
}

export const CAMERA_DETECTION_PRESENTATIONS: Readonly<
  Record<CameraDetection, CameraDetectionPresentation>
> = {
  person: { label: 'Person seen', keywords: ['person', 'people', 'human'] },
  pet: { label: 'Pet seen', keywords: ['pet', 'animal', 'dog', 'cat'] },
  motion: { label: 'Motion', keywords: ['motion', 'movement'] },
  baby_cry: { label: 'Baby crying', keywords: ['baby', 'cry', 'crying', 'babycry', 'infant'] },
  abnormal_sound: { label: 'Unusual sound', keywords: ['unusual', 'abnormal', 'sound', 'noise'] },
  loud_sound: { label: 'Loud sound', keywords: ['loud', 'louder', 'sound', 'noise'] },
  doorbell: { label: 'Doorbell', keywords: ['doorbell', 'bell', 'ring'] },
  call: { label: 'Call', keywords: ['call', 'calling'] },
};

export const EVENT_KIND_LABELS: Readonly<Record<EventKind, string>> = {
  doorbell: CAMERA_DETECTION_PRESENTATIONS.doorbell.label,
  call: CAMERA_DETECTION_PRESENTATIONS.call.label,
  motion: CAMERA_DETECTION_PRESENTATIONS.motion.label,
  no_motion: 'No movement',
  person: CAMERA_DETECTION_PRESENTATIONS.person.label,
  sound: 'Sound',
  alarm: 'Alarm',
  button: 'Button pressed',
  leak: 'Water leak',
  smoke: 'Smoke',
  device_online: 'Back online',
  device_offline: 'Went offline',
  automation_run: 'Automation ran',
  provider_error: 'Connection problem',
  pet: CAMERA_DETECTION_PRESENTATIONS.pet.label,
  opened: 'Opened',
  maintenance: 'Needs maintenance',
  fault: 'Device fault',
  activity: 'Device activity',
  cycle_finished: 'Cycle finished',
  computer_power: 'Computer power',
  machine_action: 'Machine action',
  phone_context_changed: 'Started doing something else',
  place_arrived: 'Arrived',
  place_left: 'Left',
  parked: 'Parked',
  phone_unlocked: 'Phone unlocked',
  zone_enter: 'Entered zone',
  zone_leave: 'Left zone',
  app_opened: 'App opened',
  app_closed: 'App closed',
  app_focused: 'App in front',
  app_unfocused: 'App sent to the back',
  signal: 'Home event',
};

export const LAUNDRY_EVENT_FAMILY = 'laundry';

export function eventLabel(kind: EventKind, details: Readonly<Record<string, unknown>>): string {
  if (kind === 'cycle_finished' && details['family'] === LAUNDRY_EVENT_FAMILY) {
    return details['outcome'] === 'stopped' ? 'Laundry stopped' : 'Laundry done';
  }
  if (kind === 'signal' && typeof details['label'] === 'string' && details['label'] !== '') {
    return details['label'];
  }
  const detection = cameraDetectionOf(kind, details);
  return detection === null
    ? EVENT_KIND_LABELS[kind]
    : CAMERA_DETECTION_PRESENTATIONS[detection].label;
}

const APP_EVENT_KEYWORDS: readonly string[] = [
  'app',
  'application',
  'program',
  'window',
  'software',
];

const EVENT_KIND_KEYWORDS: Readonly<Partial<Record<EventKind, readonly string[]>>> = {
  app_opened: [...APP_EVENT_KEYWORDS, 'launched', 'started'],
  app_closed: [...APP_EVENT_KEYWORDS, 'quit', 'exited'],
  app_focused: [...APP_EVENT_KEYWORDS, 'front', 'active', 'switched to'],
  app_unfocused: [...APP_EVENT_KEYWORDS, 'back', 'inactive', 'switched away'],
};

export function eventKeywords(
  kind: EventKind,
  details: Readonly<Record<string, unknown>>,
): readonly string[] {
  if (kind === 'signal') {
    return [details['source'], details['kind']].filter((part) => typeof part === 'string');
  }
  const detection = cameraDetectionOf(kind, details);
  return detection === null
    ? (EVENT_KIND_KEYWORDS[kind] ?? [])
    : CAMERA_DETECTION_PRESENTATIONS[detection].keywords;
}
