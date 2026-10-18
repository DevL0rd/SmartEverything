import type { PhoneDetail } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { playTime } from '../../../format/time';
import type { PhoneReadings } from '../phone-values';

export type VolumeStream = 'media' | 'ring' | 'notification' | 'alarm';

export interface StreamSpec {
  readonly stream: VolumeStream;
  readonly label: string;
  readonly icon: IconName;
  readonly capability: string;
}

export const VOLUME_STREAMS: readonly StreamSpec[] = [
  { stream: 'media', label: 'Media', icon: 'music', capability: 'volume' },
  { stream: 'ring', label: 'Ring', icon: 'bell', capability: 'ring_volume' },
  {
    stream: 'notification',
    label: 'Notification',
    icon: 'messageCircle',
    capability: 'notification_volume',
  },
  { stream: 'alarm', label: 'Alarm', icon: 'alarmClock', capability: 'alarm_volume' },
];

type SoundSection = NonNullable<PhoneDetail['sound']>;

type Output = SoundSection['output'];

export type PhoneMedia = NonNullable<SoundSection['media']>;

const OUTPUT_TEXT: Readonly<Record<Output['kind'], string>> = {
  speaker: 'Speaker',
  wired: 'Wired',
  bluetooth: 'Bluetooth',
  car: 'Car',
  usb: 'USB',
  other: 'Other',
};

const OUTPUT_ICON: Readonly<Record<Output['kind'], IconName>> = {
  speaker: 'speaker',
  wired: 'headphones',
  bluetooth: 'bluetooth',
  car: 'car',
  usb: 'usb',
  other: 'speaker',
};

export function levelOf(
  spec: StreamSpec,
  sound: PhoneDetail['sound'],
  readings: PhoneReadings,
): number | null {
  return sound?.streams[spec.stream] ?? readings.volumes[spec.stream];
}

export function outputIcon(kind: Output['kind']): IconName {
  return OUTPUT_ICON[kind];
}

export function outputText(output: Output): string {
  const route = OUTPUT_TEXT[output.kind];
  return output.name === null || output.name === '' ? route : `${output.name} · ${route}`;
}

export function mediaTitle(media: PhoneMedia, fallback: string | null): string | null {
  return media.title ?? fallback;
}

export function mediaSubtitle(media: PhoneMedia): string | null {
  const parts = [media.artist, media.appLabel].filter(
    (part): part is string => part !== null && part !== '',
  );
  return parts.length === 0 ? null : parts.join(' · ');
}

export interface MediaProgress {
  readonly share: number;
  readonly spoken: string;
  readonly elapsed: string;
  readonly total: string;
}

export function mediaProgressOf(media: PhoneMedia): MediaProgress | null {
  const { positionMs, durationMs } = media;
  if (positionMs === null || durationMs === null || durationMs <= 0) return null;
  const share = Math.min(1, positionMs / durationMs);
  const elapsed = playTime(positionMs / 1000);
  const total = playTime(durationMs / 1000);
  return { share, elapsed, total, spoken: `${elapsed} of ${total}` };
}

export function callLevel(sound: PhoneDetail['sound']): number | null {
  return sound?.streams.call ?? null;
}
