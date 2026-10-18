import type { SyncthingFolder, SyncthingSnapshot } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { orderedFolders } from '../model/folder-model';
import { invitationCount, shortStateOf, spokenStatus, staleOf, statusOf } from './sync-model';

const NOW = Date.parse('2026-10-17T13:45:00.000+00:00');
const ID = 'AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF-GGGGGGG-HHHHHHH';

function folder(overrides: Partial<SyncthingFolder>): SyncthingFolder {
  return {
    id: 'f',
    label: 'Folder',
    path: '/x',
    type: 'sendreceive',
    paused: false,
    state: 'idle',
    completionPercent: 100,
    needBytes: 0,
    needItems: 0,
    localChanges: 0,
    errors: [],
    errorCount: 0,
    stateError: null,
    sharedWith: [],
    lastScan: null,
    lastFile: null,
    ...overrides,
  };
}

function snapshot(
  summary: Partial<SyncthingSnapshot['summary']>,
  folders: readonly SyncthingFolder[],
): SyncthingSnapshot {
  return {
    at: '2026-10-17T13:44:00.000+00:00',
    connection: { state: 'online' },
    version: null,
    myId: null,
    uptimeSeconds: null,
    ratesLive: true,
    summary: {
      state: 'syncing',
      needBytes: 1_800_000_000,
      foldersBehind: 1,
      peersOnline: 2,
      peersTotal: 4,
      downloadBytesPerSecond: 4_200_000,
      uploadBytesPerSecond: 600_000,
      ...summary,
    },
    folders: [...folders],
    peers: [],
    pendingDevices: [],
    pendingFolders: [],
    attention: [],
  };
}

describe('orderedFolders for the widget', () => {
  it('lists failing folders first, then syncing ones, then the rest by name', () => {
    const order = orderedFolders([
      folder({ id: 'a', label: 'Archive' }),
      folder({ id: 'p', label: 'Photos', completionPercent: 62, needBytes: 10 }),
      folder({ id: 'd', label: 'Documents', errorCount: 2 }),
      folder({ id: 'b', label: 'Books' }),
    ]).map((entry) => entry.id);
    expect(order).toEqual(['d', 'p', 'a', 'b']);
  });
});

describe('statusOf', () => {
  it('says how much is left while syncing and fills the ring from what is still syncing', () => {
    const status = statusOf(
      snapshot({}, [
        folder({ completionPercent: 50, needBytes: 5 }),
        folder({ id: 'g', completionPercent: 100 }),
      ]),
    );
    expect(status.word).toBe('Syncing');
    expect(status.left).toBe('1.8 GB left');
    expect(status.percent).toBe(50);
    expect(status.live).toBe(true);
  });

  it('is complete and quiet when everything is up to date', () => {
    const status = statusOf(
      snapshot(
        {
          state: 'in_sync',
          needBytes: 0,
          peersOnline: 4,
          downloadBytesPerSecond: 0,
          uploadBytesPerSecond: 0,
        },
        [folder({})],
      ),
    );
    expect(status.word).toBe('Up to date');
    expect(status.share).toBe(1);
    expect(status.left).toBe('4 of 4 devices connected');
    expect(status.live).toBe(false);
  });

  it('has no ring without folders', () => {
    const status = statusOf(snapshot({ state: 'empty', needBytes: 0, peersTotal: 0 }, []));
    expect(status.share).toBeNull();
    expect(status.left).toBe('No other devices');
  });

  it('keeps a visible gap in the ring just below complete', () => {
    const status = statusOf(snapshot({}, [folder({ completionPercent: 99.6, needBytes: 4 })]));
    expect(status.share).toBeLessThan(0.95);
  });
});

describe('spokenStatus', () => {
  it('reads the stale line when the connection is lost, else the word and percent', () => {
    const status = statusOf(snapshot({}, [folder({ completionPercent: 50, needBytes: 5 })]));
    expect(spokenStatus(status, null)).toBe('Syncing, 50 percent complete');
    expect(
      spokenStatus(status, {
        short: 'Offline · 5 min',
        long: 'Can’t reach Syncthing',
        critical: true,
      }),
    ).toBe('Can’t reach Syncthing');
  });
});

describe('shortStateOf', () => {
  it('shows the percent while syncing and the state word otherwise', () => {
    expect(
      shortStateOf({ tone: 'info', glyph: null, text: '62 % · 1.5 GB left', percent: 62 }),
    ).toBe('62 %');
    expect(
      shortStateOf({ tone: 'critical', glyph: 'warning', text: '2 failed', percent: 90 }),
    ).toBe('2 failed');
  });
});

describe('staleOf', () => {
  it('says how long Syncthing has been unreachable', () => {
    expect(
      staleOf(
        { state: 'unreachable', reason: 'timeout', since: '2026-10-17T13:40:00.000+00:00' },
        NOW,
      ),
    ).toEqual({
      short: 'Offline · 5 min',
      long: 'Can’t reach Syncthing · 5 min',
      critical: true,
    });
  });

  it('flags a rejected key as critical and a connecting service as calm', () => {
    expect(staleOf({ state: 'key_rejected' }, NOW)?.critical).toBe(true);
    expect(staleOf({ state: 'connecting' }, NOW)?.critical).toBe(false);
  });

  it('has no caption while online or not set up', () => {
    expect(staleOf({ state: 'online' }, NOW)).toBeNull();
    expect(staleOf({ state: 'not_set_up' }, NOW)).toBeNull();
  });
});

describe('invitationCount', () => {
  it('adds device and folder invitations', () => {
    const base = snapshot({}, []);
    expect(
      invitationCount({
        ...base,
        pendingDevices: [{ id: ID, name: 'Tablet', address: null, at: base.at }],
        pendingFolders: [{ id: 'r', label: 'Recipes', offeredBy: [], encrypted: false }],
      }),
    ).toBe(2);
  });
});
