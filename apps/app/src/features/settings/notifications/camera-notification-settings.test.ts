import {
  CAMERA_NOTIFICATION_KINDS,
  CLIENT_PREFS,
  DEFAULT_CAMERA_NOTIFICATIONS,
  type CameraNotificationsPref,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { emptyState, type StoreState } from '../../../store/state';
import type { SettingDefinition, SettingEnv } from '../../../settings/types';
import { CAMERA_NOTIFICATION_SETTINGS } from './camera-notification-settings';

const AVAILABILITY: SettingEnv['availability'] = {
  hasDevices: true,
  hasClimate: false,
  hasCameras: true,
  hasHealth: false,
  hasScenes: false,
  hasEnergy: false,
  hasSecurity: false,
  hasIr: false,
  hasWatch: false,
  needsAttention: false,
};

function stateWith(pref: CameraNotificationsPref): StoreState {
  const definition = CLIENT_PREFS.camera_notifications;
  const state = emptyState();
  return {
    ...state,
    tables: {
      ...state.tables,
      layouts: {
        ...state.tables.layouts,
        byId: {
          [definition.storageKey]: {
            client_id: null,
            profile_id: 'person-1',
            page: definition.storageKey,
            layout: definition.encode(pref),
            updated_at: '2026-10-18T10:00:00.000Z',
          },
        },
      },
    },
  };
}

function setting(id: string): SettingDefinition {
  const found = CAMERA_NOTIFICATION_SETTINGS.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no camera notification setting ${id}`);
  }
  return found;
}

function readOf(id: string, state: StoreState): unknown {
  const found = setting(id);
  if (found.control !== 'switch' && found.control !== 'select') {
    throw new Error(`${id} is not a switch or a select`);
  }
  return found.read(state);
}

describe('the camera notification rows on the notifications page', () => {
  it('has one switch for every kind of camera notification, all searchable by camera words', () => {
    const switches = CAMERA_NOTIFICATION_SETTINGS.filter((row) => row.control === 'switch');
    expect(switches.map((row) => row.id)).toEqual(
      CAMERA_NOTIFICATION_KINDS.map((kind) => `notifications.camera.${kind}`),
    );
    expect(switches.every((row) => row.keywords.includes('camera'))).toBe(true);
    expect(switches.every((row) => row.page === 'notifications')).toBe(true);
  });

  it('shows the saved default of each kind and falls back to the shipped defaults', () => {
    const fresh = emptyState();
    expect(readOf('notifications.camera.baby_cry', fresh)).toBe(true);
    expect(readOf('notifications.camera.motion', fresh)).toBe(false);
    const saved = stateWith({
      ...DEFAULT_CAMERA_NOTIFICATIONS,
      kinds: { ...DEFAULT_CAMERA_NOTIFICATIONS.kinds, motion: true },
    });
    expect(readOf('notifications.camera.motion', saved)).toBe(true);
  });

  it('shows the saved cooldown as minutes, two by default', () => {
    expect(readOf('notifications.camera.cooldown', emptyState())).toBe('2');
    expect(
      readOf(
        'notifications.camera.cooldown',
        stateWith({ ...DEFAULT_CAMERA_NOTIFICATIONS, cooldownMinutes: 10 }),
      ),
    ).toBe('10');
  });

  it('asks for the quiet hours end only once a start is chosen', () => {
    const end = setting('notifications.camera.quiet_to');
    const quiet = stateWith({
      ...DEFAULT_CAMERA_NOTIFICATIONS,
      quiet: { from: '22:00', to: '06:30' },
    });
    expect(end.when?.(emptyState())).toBe(false);
    expect(end.when?.(quiet)).toBe(true);
    expect(readOf('notifications.camera.quiet_from', quiet)).toBe('22:00');
    expect(readOf('notifications.camera.quiet_to', quiet)).toBe('06:30');
    expect(readOf('notifications.camera.quiet_from', emptyState())).toBe('off');
  });

  it('is hidden in a home without cameras', () => {
    const none = {
      owner: true,
      platform: 'android',
      availability: { ...AVAILABILITY, hasCameras: false },
    } as const;
    expect(CAMERA_NOTIFICATION_SETTINGS.every((row) => row.visible?.(none) === false)).toBe(true);
  });
});
