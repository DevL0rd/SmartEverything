import { createElement } from 'react';
import { PREFS, savePref } from '../../../store/prefs';
import type { SettingContext, SettingDefinition, SettingEnv } from '../../../settings/types';
import { CAMERA_NOTIFICATION_SETTINGS } from './camera-notification-settings';
import {
  MuteRingsRow,
  PhonePushRow,
  ScreenAlertsRow,
  aiSpeechOf,
  callRingOf,
} from './notification-rows';
import {
  FIREBASE_PAGE,
  ChooseKeyRow,
  ForgetKeyRow,
  PasteKeyRow,
  PushPurposeRow,
  PushServiceHelp,
  PushStatusRow,
} from './push-service-rows';

const onAndroid = (env: SettingEnv): boolean => env.platform === 'android';

const SERVICE = 'notifications/push-service';

export const NOTIFICATION_SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'notifications.phone',
    page: 'notifications',
    section: 'This device',
    title: 'Alerts on this phone',
    keywords: ['push', 'notifications', 'permission', 'alerts'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: onAndroid,
    render: () => createElement(PhonePushRow),
  },
  {
    id: 'notifications.screen',
    page: 'notifications',
    section: 'This device',
    title: 'Alerts on this device',
    keywords: ['notifications', 'alerts'],
    scope: 'device',
    control: 'custom',
    row: true,
    visible: (env) => !onAndroid(env),
    render: () => createElement(ScreenAlertsRow),
  },
  {
    id: 'notifications.ring_sound',
    page: 'notifications',
    section: 'Doorbell & calls',
    title: 'Ring sound',
    icon: 'volume',
    keywords: ['ring', 'ringtone', 'doorbell', 'call', 'sound'],
    scope: 'client',
    control: 'switch',
    read: (state) => callRingOf(state).sound,
    write: (sound: boolean, context: SettingContext): Promise<void> => {
      savePref(context.store, PREFS.callRing, { ...callRingOf(context.state), sound });
      return Promise.resolve();
    },
  },
  {
    id: 'notifications.ai_speech_text',
    page: 'notifications',
    section: 'Doorbell & calls',
    title: 'Show what the AI says in its notification',
    description:
      'When the AI speaks to this phone with the app closed, the notification only says it is speaking. Turn this on to also show the words, which can then appear on the lock screen.',
    icon: 'lock',
    keywords: ['ai speech', 'speak', 'lock screen', 'privacy', 'notification text', 'voice'],
    scope: 'client',
    control: 'switch',
    visible: onAndroid,
    read: (state) => aiSpeechOf(state).showText,
    write: (showText: boolean, context: SettingContext): Promise<void> => {
      savePref(context.store, PREFS.aiSpeech, { showText });
      return Promise.resolve();
    },
  },
  {
    id: 'notifications.mute_rings',
    page: 'notifications',
    section: 'Doorbell & calls',
    title: 'Mute rings',
    keywords: ['mute', 'silence', 'do not disturb', 'doorbell'],
    scope: 'client',
    control: 'custom',
    row: true,
    render: () => createElement(MuteRingsRow),
  },
  ...CAMERA_NOTIFICATION_SETTINGS,
  {
    id: 'push_service.purpose',
    page: SERVICE,
    title: 'What the push service is for',
    keywords: ['firebase', 'call alerts', 'fcm'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(PushPurposeRow),
  },
  {
    id: 'push_service.status',
    page: SERVICE,
    title: 'Push service',
    keywords: ['firebase', 'push service', 'fcm'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(PushStatusRow),
  },
  {
    id: 'push_service.choose',
    page: FIREBASE_PAGE,
    section: 'Service account key',
    title: 'Import key file',
    keywords: ['firebase key', 'service account', 'json', 'import', 'choose key file'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(ChooseKeyRow),
  },
  {
    id: 'push_service.paste',
    page: FIREBASE_PAGE,
    section: 'Service account key',
    title: 'Paste instead',
    keywords: ['firebase key', 'service account', 'paste key', 'clipboard'],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(PasteKeyRow),
  },
  {
    id: 'push_service.forget',
    page: FIREBASE_PAGE,
    section: 'Service account key',
    title: 'Forget key',
    keywords: ['remove firebase'],
    scope: 'server',
    control: 'custom',
    row: true,
    when: (state) => state.settings?.push_project_id !== null,
    render: () => createElement(ForgetKeyRow),
  },
  {
    id: 'push_service.help',
    page: FIREBASE_PAGE,
    title: 'Where to find the key',
    keywords: ['firebase console'],
    scope: 'server',
    control: 'custom',
    render: () => createElement(PushServiceHelp),
  },
];
