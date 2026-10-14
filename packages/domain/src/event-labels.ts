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
  computer_power: 'Computer power',
  phone_context_changed: 'Started doing something else',
  place_arrived: 'Arrived',
  place_left: 'Left',
  parked: 'Parked',
  phone_unlocked: 'Phone unlocked',
  zone_enter: 'Entered zone',
  zone_leave: 'Left zone',
};

export function eventLabel(kind: EventKind, details: Readonly<Record<string, unknown>>): string {
  const detection = cameraDetectionOf(kind, details);
  return detection === null
    ? EVENT_KIND_LABELS[kind]
    : CAMERA_DETECTION_PRESENTATIONS[detection].label;
}

export function eventKeywords(
  kind: EventKind,
  details: Readonly<Record<string, unknown>>,
): readonly string[] {
  const detection = cameraDetectionOf(kind, details);
  return detection === null ? [] : CAMERA_DETECTION_PRESENTATIONS[detection].keywords;
}
