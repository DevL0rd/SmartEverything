import { describe, expect, it } from 'vitest';
import {
  DRIVE_PLACEMENT,
  DRIVE_ROOT,
  type DrivePlacement,
  type DriveRoot,
} from '@smarteverything/domain';
import { ROOT_ID, rootRow } from '../../nas/data/fixtures';
import type { ComputerPlacement, PlacementTarget } from '../placements/use-placements';
import {
  NOT_SYNCED,
  computerSwitchOf,
  computerSyncStateOf,
  placementTargetOf,
  syncedBodyOf,
} from './folder-computers';
import {
  conflictChoiceOf,
  conflictLabelOf,
  folderSettingsSubtitleOf,
  notSyncedBodyOf,
  stopSyncingRequestOf,
  versionsNoteOf,
} from './folder-settings-screen';

const AT = '2026-11-07T10:00:00.000Z';
const DEVICE = 'b0000000-0000-4000-8000-000000000002';
const ME = 'c0000000-0000-4000-8000-000000000001';

function synced(patch: Partial<Record<string, unknown>> = {}): DriveRoot {
  return DRIVE_ROOT.parse({
    ...rootRow(ROOT_ID, 'ready'),
    label: 'Media disk',
    bytes: 1_800_000_000_000,
    items: 41_920,
    synced: true,
    sync: { ignorePatterns: ['*.tmp'], conflictCopies: true, clients: [] },
    ...patch,
  });
}

function placement(
  patch: Partial<DrivePlacement> = {},
  status: Partial<DrivePlacement['status']> = {},
): DrivePlacement {
  return DRIVE_PLACEMENT.parse({
    id: 'e0000000-0000-4000-8000-000000000001',
    deviceId: DEVICE,
    rootId: ROOT_ID,
    folderItemId: null,
    mode: 'synced',
    localPath: '/home/me/Media disk',
    enabled: true,
    hold: null,
    createdBy: ME,
    createdAt: AT,
    status: {
      state: 'up_to_date',
      tier: null,
      basicLimits: null,
      readOnly: false,
      route: null,
      cacheBytes: 0,
      pinnedBytes: 0,
      openFiles: 0,
      pendingUploads: 0,
      reason: null,
      reportedAt: AT,
      ...status,
    },
    ...patch,
  });
}

function row(value: DrivePlacement | null, needBytes = 0): ComputerPlacement {
  return {
    computer: { deviceId: DEVICE, name: 'Laptop', glyph: 'laptop', online: true },
    placement: value,
    needBytes,
  };
}

const TARGET: PlacementTarget = placementTargetOf(synced());

describe('folder settings words', () => {
  it('maps conflict copies to the two choices', () => {
    const root = synced();
    if (root.sync === null) throw new Error('expected a synced root');
    expect(conflictChoiceOf(root.sync)).toBe('both');
    expect(conflictLabelOf(root.sync)).toBe('Keep both and tell me');
    const ask = { ...root.sync, conflictCopies: false };
    expect(conflictChoiceOf(ask)).toBe('ask');
    expect(conflictLabelOf(ask)).toBe('Ask me each time');
  });

  it('notes that earlier versions still age out when versions are off', () => {
    expect(versionsNoteOf(synced())).toBe(
      'Off for this folder. Earlier versions still age out over a year.',
    );
    expect(versionsNoteOf(synced({ versions: true }))).toBe(
      'Each change keeps the earlier version for a year.',
    );
    expect(versionsNoteOf(synced({ readOnly: true }))).toBe(
      'A view-only folder is never changed, so it keeps no versions.',
    );
  });

  it('says who sees the folder, its size and its file count', () => {
    expect(folderSettingsSubtitleOf(synced())).toMatch(/^Shared · .+ · 41,920 files$/);
  });

  it('says nothing is deleted when sync stops', () => {
    const request = stopSyncingRequestOf(synced());
    expect(request.title).toBe('Stop syncing Media disk?');
    expect(request.body).toContain('Nothing is deleted.');
    expect(request.tone).toBe('destructive');
  });

  it('explains a folder that is not synced to owners and members', () => {
    const root = synced({
      synced: false,
      sync: { ignorePatterns: [], conflictCopies: false, clients: [] },
    });
    expect(notSyncedBodyOf(root, true)).toContain('Sync it');
    expect(notSyncedBodyOf(root, false)).toBe(
      'The owner of the home can sync this library folder to computers.',
    );
  });
});

describe('computer rows', () => {
  it('shows a computer without the folder as not synced and offers the folder picker', () => {
    expect(computerSyncStateOf(row(null))).toEqual({
      label: NOT_SYNCED,
      tone: 'neutral',
      detail: null,
      on: false,
      held: false,
    });
    expect(computerSwitchOf(row(null), true)).toEqual({ kind: 'pick' });
    expect(computerSwitchOf(row(null), false)).toEqual({ kind: 'none' });
  });

  it('shows the live state and what is still to get', () => {
    const state = computerSyncStateOf(
      row(placement({}, { state: 'syncing', pendingUploads: 2 }), 1024),
    );
    expect(state.label).toBe('Syncing');
    expect(state.tone).toBe('info');
    expect(state.on).toBe(true);
    expect(state.detail).toMatch(/to get · 2 changes to send$/);
  });

  it('pauses and resumes a synced computer without moving its folder', () => {
    expect(computerSwitchOf(row(placement()), false)).toEqual({ kind: 'enable', enabled: false });
    const paused = row(placement({ enabled: false }));
    expect(computerSyncStateOf(paused).label).toBe('Paused');
    expect(computerSwitchOf(paused, true)).toEqual({ kind: 'enable', enabled: true });
    expect(syncedBodyOf(paused, TARGET, '/home/me/Media disk', true)).toEqual({
      deviceId: DEVICE,
      rootId: ROOT_ID,
      folderItemId: null,
      mode: 'synced',
      localPath: '/home/me/Media disk',
      enabled: true,
    });
  });

  it('asks before switching a mounted computer to synced', () => {
    const mounted = row(placement({ mode: 'mounted' }, { state: 'mounted' }));
    expect(computerSyncStateOf(mounted).on).toBe(false);
    expect(computerSwitchOf(mounted, true)).toEqual({ kind: 'toSynced' });
  });

  it('locks a held computer and says why', () => {
    const held = row(placement({ hold: 'trashed' }));
    expect(computerSyncStateOf(held)).toMatchObject({
      label: 'Stopped',
      detail: 'The folder is in the trash',
      held: true,
      on: false,
    });
    expect(computerSwitchOf(held, false)).toEqual({ kind: 'none' });
  });
});
