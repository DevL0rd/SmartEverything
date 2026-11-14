import { describe, expect, it } from 'vitest';
import type { BackupDeviceState, BackupState } from '@smarteverything/domain';
import { INITIAL_BACKUP_STATUS, type BackupStatus } from '../backup/model/status';
import { NO_PROGRESS } from '../backup/phones-model';
import { toggled } from './backup-albums';
import {
  PERSON_FOLDER_TEMPLATE,
  albumsText,
  backupCardOf,
  devicesLineOf,
  duplicatesCardOf,
  folderOf,
  offlineText,
  summaryText,
} from './model';

function deviceOf(patch: Partial<BackupDeviceState> = {}, enabled = true): BackupDeviceState {
  return {
    device: {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      profileId: 'a1b2c3d4-0000-4000-8000-000000000002',
      deviceId: 'pixel',
      name: 'Pixel 9',
      platform: 'android',
      lastSeenAt: '2026-11-07T10:00:00.000Z',
      settings: { enabled, folders: [], wifiOnly: true, chargingOnly: false, includeVideos: true },
    },
    backedUp: 90,
    pending: 10,
    uploading: 0,
    failed: 0,
    lastBackupAt: null,
    ...patch,
  };
}

function stateOf(devices: readonly BackupDeviceState[]): BackupState {
  return { devices, bytesLeft: 0, targetFolder: 'Photos' };
}

function status(patch: Partial<BackupStatus>): BackupStatus {
  return { ...INITIAL_BACKUP_STATUS, ...patch };
}

describe('photos settings model', () => {
  it('shows the backup folder of the person once', () => {
    expect(folderOf(stateOf([]))).toBe('Photos');
    expect(folderOf(undefined)).toBe(PERSON_FOLDER_TEMPLATE);
  });

  it('shows only the counts the hub has answered', () => {
    expect(summaryText(null, null)).toBeNull();
    expect(summaryText(48213, null)).toMatch(/^48\D?213 items$/);
    expect(summaryText(1, 1)).toBe('1 item · 1 device backing up');
  });

  it('says what still works while the hub is offline', () => {
    expect(offlineText(false)).toBe('Changing these settings needs your home hub.');
    expect(offlineText(true)).toContain('Backup on this device keeps going');
  });

  it('names the chosen albums and toggles them', () => {
    expect(albumsText([])).toBe('All photos and videos');
    expect(albumsText(['camera'])).toBe('1 album');
    expect(toggled(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggled(['a', 'b'], 'a', false)).toEqual(['b']);
  });

  it('counts the devices backing up', () => {
    expect(devicesLineOf(undefined)).toBeNull();
    expect(devicesLineOf(stateOf([deviceOf({}, false)]))).toBe('No devices back up yet');
    expect(devicesLineOf(stateOf([deviceOf(), deviceOf()]))).toBe('2 devices backing up');
  });
});

describe('the Backup link card', () => {
  const state = stateOf([deviceOf()]);

  it('leads with this device where it has a local source', () => {
    expect(backupCardOf({ status: INITIAL_BACKUP_STATUS, state, live: NO_PROGRESS })).toEqual({
      headline: 'Backup is off',
      detail: '1 device backing up',
      progress: null,
      colour: 'primary',
    });
    const uploading = status({ phase: 'uploading', total: 200, done: 80 });
    expect(backupCardOf({ status: uploading, state, live: NO_PROGRESS })).toMatchObject({
      headline: 'This device: 120 left',
      progress: 0.4,
    });
    const idle = status({ phase: 'idle', total: 5, done: 5 });
    expect(backupCardOf({ status: idle, state, live: NO_PROGRESS })).toMatchObject({
      headline: 'Up to date',
      colour: 'positive',
    });
    const waiting = status({ phase: 'paused', pauseReason: 'wifi', total: 5, done: 2 });
    expect(backupCardOf({ status: waiting, state, live: NO_PROGRESS }).headline).toBe(
      'Waiting for Wi-Fi · 3 left',
    );
  });

  it('shows only the devices backing up without a local source', () => {
    expect(backupCardOf({ status: null, state, live: NO_PROGRESS })).toEqual({
      headline: '1 device backing up',
      detail: '10 left to back up',
      progress: 0.9,
      colour: 'primary',
    });
    expect(backupCardOf({ status: null, state: undefined, live: NO_PROGRESS }).headline).toBeNull();
  });
});

describe('the Duplicates link card', () => {
  it('says how much space the copies take', () => {
    expect(duplicatesCardOf({ groups: 0, extraCopies: 0, bytesBack: 0 }).headline).toBe(
      'No duplicates',
    );
    const view = duplicatesCardOf({ groups: 3, extraCopies: 4, bytesBack: 2048 });
    expect(view.headline).toMatch(/^3 groups · .+ to win back$/);
    expect(view.detail).toBe('4 extra copies');
  });
});
