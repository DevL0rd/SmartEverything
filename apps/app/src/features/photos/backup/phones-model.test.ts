import { describe, expect, it } from 'vitest';
import type { BackupDeviceState, BackupState, PhotosProgressNotice } from '@smarteverything/domain';
import { INITIAL_BACKUP_STATUS, type BackupStatus } from './model/status';
import {
  NO_PROGRESS,
  backupSubtitleOf,
  badgeOf,
  conditionChipsOf,
  countsOf,
  currentFirst,
  hubChipOf,
  phoneChipOf,
  phoneConditions,
  phoneViewOf,
  progressAfter,
} from './phones-model';

function stateOf(patch: Partial<BackupDeviceState> = {}, enabled = true): BackupDeviceState {
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
    backedUp: 12_406,
    pending: 30,
    uploading: 4,
    failed: 0,
    lastBackupAt: '2026-11-07T09:40:00.000Z',
    ...patch,
  };
}

function hubOf(devices: readonly BackupDeviceState[]): BackupState {
  return { devices, bytesLeft: 400_000_000, targetFolder: 'Photos' };
}

function notice(patch: Partial<PhotosProgressNotice>): PhotosProgressNotice {
  return { type: 'photos_progress', kind: 'backup', done: 0, total: 0, ...patch };
}

function status(patch: Partial<BackupStatus>): BackupStatus {
  return { ...INITIAL_BACKUP_STATUS, ...patch };
}

describe('live backup progress', () => {
  it('keeps the newest backup count per phone and ignores per-item processing notices', () => {
    const one = progressAfter(NO_PROGRESS, notice({ deviceId: 'pixel', done: 3, total: 10 }));
    const two = progressAfter(
      one,
      notice({ kind: 'preview', itemId: crypto.randomUUID(), done: 1, total: 1 }),
    );
    const three = progressAfter(two, notice({ kind: 'preview', done: 5, total: 9 }));
    expect(one.devices.get('pixel')).toEqual({ done: 3, total: 10 });
    expect(two).toBe(one);
    expect(three.kinds.get('preview')).toEqual({ done: 5, total: 9 });
    expect(progressAfter(three, notice({ done: 1, total: 2 }))).toBe(three);
  });

  it('lets a live notice win over the stored counts', () => {
    expect(countsOf(stateOf(), undefined)).toEqual({
      backedUp: 12_406,
      left: 34,
      uploading: true,
      failed: 0,
    });
    expect(countsOf(stateOf(), { done: 12_440, total: 12_440 })).toEqual({
      backedUp: 12_440,
      left: 0,
      uploading: false,
      failed: 0,
    });
  });
});

describe('phone rows', () => {
  it('names the state in the badge', () => {
    expect(badgeOf(false, { backedUp: 1, left: 1, uploading: true, failed: 0 }).label).toBe('Off');
    expect(badgeOf(true, { backedUp: 1, left: 0, uploading: false, failed: 0 })).toEqual({
      label: 'Up to date',
      tone: 'positive',
    });
    expect(badgeOf(true, { backedUp: 1, left: 34, uploading: true, failed: 0 }).label).toBe(
      'Backing up 34',
    );
    expect(badgeOf(true, { backedUp: 1, left: 3, uploading: false, failed: 3 }).tone).toBe(
      'critical',
    );
    expect(badgeOf(true, { backedUp: 1, left: 9, uploading: false, failed: 0 }).tone).toBe(
      'warning',
    );
  });

  it('shows progress and conditions while items are left and the last backup when done', () => {
    const busy = phoneViewOf(stateOf(), { live: undefined, current: false });
    expect(busy.detail).toBe('12,406 of 12,440 · Wi-Fi only · videos on');
    expect(busy.coverage).toBeCloseTo(12_406 / 12_440);
    expect(busy.share).toBe(`99\u00a0%`);
    const done = phoneViewOf(stateOf({ pending: 0, uploading: 0 }), {
      live: undefined,
      current: true,
    });
    expect(done.current).toBe(true);
    expect(done.detail.startsWith('12,406 items · last backup')).toBe(true);
    expect(done.colour).toBe('positive');
  });

  it('writes the page subtitle from every phone', () => {
    expect(backupSubtitleOf(undefined, NO_PROGRESS)).toBe(
      'Devices back up here · originals kept as they are',
    );
    expect(backupSubtitleOf(hubOf([stateOf(), stateOf()]), NO_PROGRESS)).toBe(
      '2 phones back up here · 68 items left · originals kept as they are',
    );
  });

  it('puts the current device first and keeps the others in order', () => {
    const rows = [
      { id: 'a', current: false },
      { id: 'b', current: true },
      { id: 'c', current: false },
    ];
    expect(currentFirst(rows).map((row) => row.id)).toEqual(['b', 'a', 'c']);
  });

  it('describes the conditions each device backs up under', () => {
    const settings = {
      enabled: true,
      folders: [],
      wifiOnly: true,
      chargingOnly: false,
      includeVideos: true,
    };
    expect(phoneConditions(settings)).toBe('Wi-Fi only · videos on');
    expect(phoneConditions({ ...settings, wifiOnly: false }, 'desktop')).toBe(
      'All networks · videos on',
    );
  });
});

describe('the backup chip', () => {
  it('shows nothing on the hub without phones and a ring, check or pause otherwise', () => {
    expect(hubChipOf(hubOf([]), NO_PROGRESS)).toBeNull();
    expect(hubChipOf(hubOf([stateOf({}, false)]), NO_PROGRESS)).toBeNull();
    expect(hubChipOf(hubOf([stateOf()]), NO_PROGRESS)?.label).toBe('Backing up 34');
    expect(hubChipOf(hubOf([stateOf({ pending: 0, uploading: 0 })]), NO_PROGRESS)?.mark).toBe(
      'check',
    );
    expect(hubChipOf(hubOf([stateOf({ uploading: 0 })]), NO_PROGRESS)).toMatchObject({
      mark: 'pause',
      label: '30 waiting',
    });
  });

  it('follows the phone runner with the pause reason', () => {
    expect(phoneChipOf(status({ phase: 'off' }))).toBeNull();
    expect(phoneChipOf(status({ phase: 'unavailable' }))).toBeNull();
    expect(
      phoneChipOf(status({ phase: 'paused', pauseReason: 'wifi', total: 10, done: 4 })),
    ).toEqual({
      mark: 'pause',
      label: 'Waiting for Wi-Fi',
      progress: 0.4,
    });
    expect(phoneChipOf(status({ phase: 'uploading', total: 10, done: 4 }))?.label).toBe(
      'Backing up 6',
    );
    expect(phoneChipOf(status({ phase: 'idle', total: 10, done: 10 }))?.mark).toBe('check');
  });

  it('lists the phone conditions in the design wording', () => {
    expect(
      conditionChipsOf(
        { wifiOnly: true, chargingOnly: false, includeVideos: true },
        false,
        null,
      ).map((chip) => chip.label),
    ).toEqual(['Wi-Fi only', 'Charging not needed', 'Videos on']);
    expect(
      conditionChipsOf(
        { wifiOnly: false, chargingOnly: true, includeVideos: false },
        false,
        null,
      ).map((chip) => chip.label),
    ).toEqual(['Wi-Fi and mobile data', 'Only while charging', 'Photos only']);
  });

  it('marks the condition that holds backup back', () => {
    const settings = { wifiOnly: true, chargingOnly: true, includeVideos: true };
    const blocking = (reason: Parameters<typeof conditionChipsOf>[2]): readonly string[] =>
      conditionChipsOf(settings, false, reason)
        .filter((chip) => chip.blocking)
        .map((chip) => chip.key);
    expect(blocking(null)).toEqual([]);
    expect(blocking('wifi')).toEqual(['network']);
    expect(blocking('offline')).toEqual(['network']);
    expect(blocking('charging')).toEqual(['charging']);
    expect(blocking('user')).toEqual([]);
  });
});
