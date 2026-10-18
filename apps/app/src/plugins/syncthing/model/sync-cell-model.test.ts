import type { SyncActivity, SyncthingSnapshot } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { moment } from '../../../format/time';
import { lastFileLine, syncCellOf } from './sync-cell-model';
import { folderOf, peerOf, snapshotOf } from './snapshot-fixture';

const NOW = Date.parse('2026-10-17T10:05:00+07:00');

function withSummary(
  patch: Partial<SyncthingSnapshot['summary']>,
  rest: Partial<SyncthingSnapshot> = {},
): SyncthingSnapshot {
  const base = snapshotOf();
  return { ...base, ...rest, summary: { ...base.summary, ...patch } };
}

describe('syncCellOf', () => {
  it('is up to date with the folder count and devices online', () => {
    const cell = syncCellOf(snapshotOf(), NOW);
    expect(cell.kind).toBe('synced');
    expect(cell.chip).toEqual({ tone: 'positive', label: 'Up to date' });
    expect(cell.line).toBe('1 folder · 1 of 1 device online');
    expect(cell.rates).toEqual([]);
    expect(cell.canAct).toBe(true);
    expect(cell.paused).toBe(false);
  });

  it('shows the transfer rates and what is left only while syncing', () => {
    const cell = syncCellOf(
      withSummary({
        state: 'syncing',
        needBytes: 1_500_000_000,
        downloadBytesPerSecond: 1_200_000,
        uploadBytesPerSecond: 0,
      }),
      NOW,
    );
    expect(cell.kind).toBe('syncing');
    expect(cell.chip.label).toBe('Syncing');
    expect(cell.line).toMatch(/left · 1 of 1 device online$/);
    expect(cell.rates.map((rate) => rate.caption)).toEqual(['↓ in', '↑ out']);
    expect(cell.rates[0]).toMatchObject({ value: '1.2', unit: 'MB/s' });
  });

  it('drops the rates when the transfer figures are not live', () => {
    const cell = syncCellOf(
      withSummary(
        { state: 'syncing', needBytes: 10, downloadBytesPerSecond: 5 },
        { ratesLive: false },
      ),
      NOW,
    );
    expect(cell.rates).toEqual([]);
  });

  it('offers resume when syncing is paused', () => {
    const cell = syncCellOf(withSummary({ state: 'paused' }), NOW);
    expect(cell.kind).toBe('paused');
    expect(cell.paused).toBe(true);
    expect(cell.chip).toEqual({ tone: 'warning', label: 'Paused' });
  });

  it('names the folder with failed files and counts conflicts in the chip', () => {
    const broken = folderOf({ id: 'docs', label: 'Docs', errorCount: 2 });
    const cell = syncCellOf(
      withSummary({ state: 'error' }, { folders: [folderOf(), broken] }),
      NOW,
    );
    expect(cell.kind).toBe('error');
    expect(cell.chip).toEqual({ tone: 'critical', label: '1 conflict' });
    expect(cell.problem?.id).toBe('docs');
    expect(cell.line).toBe('2 failed in Docs');
    expect(cell.folders[0]?.id).toBe('docs');
  });

  it('says no other device is online when every peer is away', () => {
    const cell = syncCellOf(
      withSummary({ peersOnline: 0 }, { peers: [peerOf({ connected: false })] }),
      NOW,
    );
    expect(cell.line).toBe('1 folder · No other devices online');
    expect(cell.peers).toEqual([{ id: peerOf().id, name: 'NAS', online: false }]);
  });

  it('shows at most three folder rings, the ones needing attention first', () => {
    const folders = ['a', 'b', 'c', 'd'].map((id) => folderOf({ id, label: id }));
    const cell = syncCellOf(
      snapshotOf({
        folders: [...folders.slice(0, 3), folderOf({ id: 'z', label: 'z', errorCount: 1 })],
      }),
      NOW,
    );
    expect(cell.folders.map((folder) => folder.id)).toEqual(['z', 'a', 'b']);
  });

  it('goes stale with the reason, keeps the rings and offers no action when unreachable', () => {
    const since = '2026-10-17T09:55:00+07:00';
    const cell = syncCellOf(
      snapshotOf({ connection: { state: 'unreachable', reason: 'timeout', since } }),
      NOW,
    );
    expect(cell.kind).toBe('stale');
    expect(cell.chip).toEqual({ tone: 'neutral', label: 'Not reachable' });
    expect(cell.reason).toContain('Can’t reach Syncthing');
    expect(cell.canAct).toBe(false);
    expect(cell.folders).toHaveLength(1);
  });
});

describe('lastFileLine', () => {
  const entry = (patch: Partial<SyncActivity>): SyncActivity => ({
    id: 1,
    at: '2026-10-17T10:03:00+07:00',
    kind: 'modified',
    folderId: 'notes',
    path: 'Notes/todo.md',
    deviceId: null,
    remote: false,
    ...patch,
  });

  it('names the newest added or changed file and when', () => {
    const line = lastFileLine(
      [
        entry({ id: 1, at: '2026-10-17T09:00:00+07:00', path: 'Docs/old.pdf' }),
        entry({ id: 2 }),
        entry({ id: 3, kind: 'deleted', at: '2026-10-17T10:04:00+07:00', path: 'Docs/gone.pdf' }),
      ],
      NOW,
    );
    expect(line).toBe(`todo.md · ${moment('2026-10-17T10:03:00+07:00', NOW)}`);
  });

  it('has nothing to say without a file change', () => {
    expect(lastFileLine([], NOW)).toBeNull();
    expect(lastFileLine([entry({ kind: 'connected', path: null })], NOW)).toBeNull();
  });
});
