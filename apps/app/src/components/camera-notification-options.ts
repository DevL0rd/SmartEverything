import {
  CAMERA_COOLDOWN_CHOICES,
  CAMERA_NOTIFICATION_KINDS,
  type CameraNotificationKind,
  type CameraQuietHours,
} from '@smarteverything/domain';
import type { IconName } from './icon';
import type { SelectOption } from './select-picker';
import { plural } from '../format/text';

export const CAMERA_NOTIFICATION_ICONS: Readonly<Record<CameraNotificationKind, IconName>> = {
  motion: 'motion',
  person: 'personStanding',
  pet: 'dog',
  sound: 'audioLines',
  baby_cry: 'baby',
  doorbell: 'bell',
  alarm: 'siren',
  offline: 'cameraOff',
  clip_ready: 'film',
};

export const CAMERA_NOTIFICATION_ORDER: readonly CameraNotificationKind[] =
  CAMERA_NOTIFICATION_KINDS;

export const FOLLOW_DEFAULT = 'default';

export const NO_QUIET_HOURS = 'off';

function minutesLabel(minutes: number): string {
  return minutes === 0 ? 'No limit' : plural(minutes, 'minute');
}

export function cooldownOptions(withDefault: boolean): readonly SelectOption<string>[] {
  const choices = CAMERA_COOLDOWN_CHOICES.map((minutes) => ({
    value: String(minutes),
    label: minutesLabel(minutes),
  }));
  return withDefault ? [{ value: FOLLOW_DEFAULT, label: 'Same as default' }, ...choices] : choices;
}

export function clockOptions(): readonly SelectOption<string>[] {
  return Array.from({ length: 48 }, (_, index) => {
    const clock = `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 === 0 ? '00' : '30'}`;
    return { value: clock, label: clock };
  });
}

const QUIET_PRESETS: readonly CameraQuietHours[] = [
  { from: '22:00', to: '07:00' },
  { from: '23:00', to: '06:00' },
  { from: '21:00', to: '08:00' },
  { from: '00:00', to: '06:00' },
];

export function quietValue(quiet: CameraQuietHours): string {
  return `${quiet.from}-${quiet.to}`;
}

export function quietFromValue(value: string): CameraQuietHours | null {
  const [from, to] = value.split('-');
  return from === undefined || to === undefined ? null : { from, to };
}

function quietLabel(quiet: CameraQuietHours): string {
  return `${quiet.from} to ${quiet.to}`;
}

export function quietOptions(current: CameraQuietHours | null): readonly SelectOption<string>[] {
  const custom =
    current !== null && !QUIET_PRESETS.some((preset) => quietValue(preset) === quietValue(current));
  const presets = custom ? [current, ...QUIET_PRESETS] : QUIET_PRESETS;
  return [
    { value: FOLLOW_DEFAULT, label: 'Same as default' },
    { value: NO_QUIET_HOURS, label: 'None' },
    ...presets.map((quiet) => ({ value: quietValue(quiet), label: quietLabel(quiet) })),
  ];
}
