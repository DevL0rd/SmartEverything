import { describe, expect, it } from 'vitest';
import type { BackupState } from '@smarteverything/domain';
import { INITIAL_BACKUP_STATUS } from '../backup/model/status';
import { toggled } from './excluded-albums';
import {
  PERSON_FOLDER_TEMPLATE,
  albumsText,
  excludedText,
  folderOf,
  offlineText,
  phoneBadge,
  phoneConditions,
  summaryText,
  thisPhoneText,
} from './model';

const SETTINGS = {
  enabled: true,
  folders: [],
  wifiOnly: true,
  chargingOnly: false,
  includeVideos: true,
};

function stateOf(patch: Partial<BackupState> = {}, enabled = true): BackupState {
  return {
    device: {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      profileId: 'a1b2c3d4-0000-4000-8000-000000000002',
      deviceId: 'pixel',
      name: 'Pixel 9',
      platform: 'android',
      lastSeenAt: '2026-11-07T10:00:00.000Z',
      settings: { ...SETTINGS, enabled },
    },
    backedUp: 100,
    pending: 0,
    uploading: 0,
    failed: 0,
    bytesLeft: 0,
    lastBackupAt: null,
    targetFolder: 'Camera roll/Alex',
    ...patch,
  };
}

describe('photos settings backup rows', () => {
  it('badges each phone by what is left to back up', () => {
    expect(phoneBadge(stateOf({}, false))).toEqual({ label: 'Off', tone: 'neutral' });
    expect(phoneBadge(stateOf())).toEqual({ label: 'Up to date', tone: 'positive' });
    expect(phoneBadge(stateOf({ pending: 30, uploading: 4 }))).toEqual({
      label: 'Backing up 34',
      tone: 'primary',
    });
    expect(phoneBadge(stateOf({ pending: 34 }))).toEqual({ label: '34 left', tone: 'warning' });
    expect(phoneBadge(stateOf({ failed: 2 }))).toEqual({ label: '2 failed', tone: 'critical' });
  });

  it('describes the conditions each phone backs up under', () => {
    expect(phoneConditions(SETTINGS)).toBe('Wi-Fi only · videos on');
    expect(
      phoneConditions({ ...SETTINGS, wifiOnly: false, chargingOnly: true, includeVideos: false }),
    ).toBe('Wi-Fi and mobile data · only while charging · photos only');
  });

  it('shows the hub backup folder with the year and month template', () => {
    expect(folderOf([stateOf()])).toBe('Camera roll/Alex/<year>/<year-month>');
    expect(folderOf([])).toBe(PERSON_FOLDER_TEMPLATE);
  });

  it('says what this phone is doing', () => {
    expect(thisPhoneText(INITIAL_BACKUP_STATUS)).toBe('Off');
    expect(
      thisPhoneText({ ...INITIAL_BACKUP_STATUS, phase: 'uploading', total: 40, done: 6 }),
    ).toBe('Backing up 34');
    expect(thisPhoneText({ ...INITIAL_BACKUP_STATUS, phase: 'paused', pauseReason: 'wifi' })).toBe(
      'Waiting for Wi-Fi',
    );
    expect(thisPhoneText({ ...INITIAL_BACKUP_STATUS, phase: 'idle' })).toBe('Up to date');
    expect(thisPhoneText({ ...INITIAL_BACKUP_STATUS, phase: 'idle', failed: 3 })).toBe(
      '3 could not back up',
    );
  });

  it('names the chosen albums', () => {
    expect(albumsText([])).toBe('All photos and videos');
    expect(albumsText(['camera'])).toBe('1 album');
  });
});

describe('photos settings summary and memories', () => {
  it('shows only the counts the hub has answered', () => {
    expect(summaryText(null, null)).toBeNull();
    expect(summaryText(48213, null)).toMatch(/^48\D?213 items$/);
    expect(summaryText(1, 1)).toBe('1 item · 1 phone');
  });

  it('says what still works while the hub is offline', () => {
    expect(offlineText(false)).toBe('Changing these settings needs your home hub.');
    expect(offlineText(true)).toContain('Backup on this phone keeps going');
  });

  it('lists and toggles the albums left out of memories', () => {
    const albums = [
      { id: 'a', title: 'Screenshots' },
      { id: 'b', title: 'House renovation' },
    ];
    expect(excludedText([], albums)).toBe('None');
    expect(excludedText(['a', 'b'], albums)).toBe('Screenshots, House renovation');
    expect(toggled(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggled(['a', 'b'], 'a', false)).toEqual(['b']);
    expect(toggled(['a'], 'a', true)).toEqual(['a']);
  });
});
