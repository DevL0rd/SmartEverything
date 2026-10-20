import {
  CAMERA_NOTIFICATION_HINTS,
  CAMERA_NOTIFICATION_LABELS,
  type CameraNotificationKind,
  type CameraNotificationsPref,
} from '@smarteverything/domain';
import {
  CAMERA_NOTIFICATION_ICONS,
  CAMERA_NOTIFICATION_ORDER,
  NO_QUIET_HOURS,
  clockOptions,
  cooldownOptions,
} from '../../../components/camera-notification-options';
import { PREFS, prefValueOf, savePref } from '../../../store/prefs';
import type { StoreState } from '../../../store/state';
import type { SettingContext, SettingDefinition, SettingEnv } from '../../../settings/types';

const SECTION = 'Cameras';

const BASE_KEYWORDS: readonly string[] = ['camera', 'notification', 'alert', 'push'];

const hasCameras = (env: SettingEnv): boolean => env.availability.hasCameras;

const camerasOf = (state: StoreState): CameraNotificationsPref =>
  prefValueOf(state, PREFS.cameraNotifications);

function save(context: SettingContext, change: Partial<CameraNotificationsPref>): Promise<void> {
  savePref(context.store, PREFS.cameraNotifications, {
    ...camerasOf(context.state),
    ...change,
  });
  return Promise.resolve();
}

const KIND_KEYWORDS: Readonly<Record<CameraNotificationKind, readonly string[]>> = {
  motion: ['motion', 'movement'],
  person: ['person', 'people', 'human'],
  pet: ['pet', 'cat', 'dog', 'animal'],
  sound: ['sound', 'noise', 'loud'],
  baby_cry: ['baby', 'cry', 'crying'],
  doorbell: ['doorbell', 'ring', 'call', 'door'],
  alarm: ['alarm', 'nobody', 'no one', 'long time'],
  offline: ['offline', 'disconnected', 'recording failed', 'failure', 'snapshot'],
  clip_ready: ['clip', 'recording', 'video', 'ready'],
};

function kindSetting(kind: CameraNotificationKind): SettingDefinition {
  return {
    id: `notifications.camera.${kind}`,
    page: 'notifications',
    section: SECTION,
    title: CAMERA_NOTIFICATION_LABELS[kind],
    description: CAMERA_NOTIFICATION_HINTS[kind],
    icon: CAMERA_NOTIFICATION_ICONS[kind],
    keywords: [...BASE_KEYWORDS, ...KIND_KEYWORDS[kind]],
    scope: 'client',
    control: 'switch',
    visible: hasCameras,
    read: (state) => camerasOf(state).kinds[kind],
    write: (on: boolean, context: SettingContext) =>
      save(context, { kinds: { ...camerasOf(context.state).kinds, [kind]: on } }),
  };
}

const QUIET_KEYWORDS: readonly string[] = [
  ...BASE_KEYWORDS,
  'quiet hours',
  'night',
  'sleep',
  'do not disturb',
  'silence',
];

export const CAMERA_NOTIFICATION_SETTINGS: readonly SettingDefinition[] = [
  ...CAMERA_NOTIFICATION_ORDER.map(kindSetting),
  {
    id: 'notifications.camera.cooldown',
    page: 'notifications',
    section: SECTION,
    title: 'One notice per kind every',
    description: 'After a camera notified about a kind of event it stays quiet for this long',
    icon: 'timer',
    keywords: [...BASE_KEYWORDS, 'cooldown', 'spam', 'too many', 'rate limit', 'repeat'],
    scope: 'client',
    control: 'select',
    options: cooldownOptions(false),
    visible: hasCameras,
    read: (state) => String(camerasOf(state).cooldownMinutes),
    write: (minutes: string, context: SettingContext) =>
      save(context, { cooldownMinutes: Number(minutes) }),
  },
  {
    id: 'notifications.camera.quiet_from',
    page: 'notifications',
    section: SECTION,
    title: 'Quiet hours start',
    description: 'No camera notification reaches your phones during quiet hours',
    icon: 'moon',
    keywords: QUIET_KEYWORDS,
    scope: 'client',
    control: 'select',
    options: [{ value: NO_QUIET_HOURS, label: 'Off' }, ...clockOptions()],
    visible: hasCameras,
    read: (state) => camerasOf(state).quiet?.from ?? NO_QUIET_HOURS,
    write: (from: string, context: SettingContext) =>
      save(context, {
        quiet:
          from === NO_QUIET_HOURS
            ? null
            : { from, to: camerasOf(context.state).quiet?.to ?? '07:00' },
      }),
  },
  {
    id: 'notifications.camera.quiet_to',
    page: 'notifications',
    section: SECTION,
    title: 'Quiet hours end',
    icon: 'sunrise',
    keywords: QUIET_KEYWORDS,
    scope: 'client',
    control: 'select',
    options: clockOptions(),
    visible: hasCameras,
    when: (state) => camerasOf(state).quiet !== null,
    read: (state) => camerasOf(state).quiet?.to ?? '07:00',
    write: (to: string, context: SettingContext): Promise<void> => {
      const quiet = camerasOf(context.state).quiet;
      return quiet === null ? Promise.resolve() : save(context, { quiet: { ...quiet, to } });
    },
  },
];
