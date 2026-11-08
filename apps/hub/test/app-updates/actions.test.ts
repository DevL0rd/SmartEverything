import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestAppUpdate, rollsBackToEmbedded, type AppUpdateEntry } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../src/data-layout';
import { appendEntry, writeBlob } from '../support/app-update-blobs';
import { testLayout } from '../support/test-layout';
import {
  ClockBehindError,
  NothingToRollBackError,
  UpdateNotFoundError,
  UpdateTargetedPromotionError,
  UpdateWithdrawnError,
  promoteEntry,
  rollbackEntries,
  withdrawEntry,
} from '../../src/app-updates/actions';
import {
  blobFile,
  blobFolder,
  pruneBlobs,
  readIndex,
  updateIndex,
} from '../../src/app-updates/store';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const NEW = '99999999-9999-4999-8999-999999999999';
const DEVICE = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-10-25T12:00:00.000Z');
const MOMENT = { id: NEW, now: NOW };
const SHARED = 'f'.repeat(64);
const ONLY_B = 'e'.repeat(64);

type DesktopEntry = Extract<AppUpdateEntry, { readonly platform: 'desktop' }>;

function entry(
  id: string,
  createdAt: string,
  overrides: Partial<DesktopEntry> = {},
): DesktopEntry {
  return {
    id,
    platform: 'desktop',
    channel: 'dev',
    runtimeVersion: 'rt-1',
    createdAt,
    appVersion: '0.1.0',
    notes: `note ${id.slice(0, 1)}`,
    launch: null,
    files: [{ path: 'index.html', sha256: SHARED, size: 4, contentType: 'text/html' }],
    expoClient: null,
    withdrawn: null,
    ...overrides,
  };
}

const OLD = entry(A, '2026-10-25T10:00:00.000Z');
const NEWER = entry(B, '2026-10-25T11:00:00.000Z', {
  files: [{ path: 'index.html', sha256: ONLY_B, size: 4, contentType: 'text/html' }],
});
const TARGET = { platform: 'desktop', channel: 'dev', runtimeVersion: 'rt-1' } as const;
const REQUEST = {
  platform: 'desktop',
  channel: 'dev',
  reason: 'bad boot',
  toEmbedded: false,
} as const;

describe('rollbackEntries', () => {
  it('refuses to promote a device-only test to a shared release', () => {
    const targeted = { ...NEWER, clientId: DEVICE };
    expect(() =>
      promoteEntry({ entries: [targeted] }, { id: targeted.id, channel: 'release' }, MOMENT),
    ).toThrow(UpdateTargetedPromotionError);
  });
  it('does not withdraw another device’s targeted release during a channel rollback', () => {
    const targeted = { ...entry(C, '2026-10-25T11:30:00.000Z'), clientId: DEVICE };
    const { index } = rollbackEntries({ entries: [OLD, NEWER, targeted] }, REQUEST, MOMENT);
    expect(index.entries.find((item) => item.id === C)).toEqual(targeted);
  });

  it('republishes a prior broadcast privately when withdrawing a targeted release', () => {
    const targeted = { ...NEWER, clientId: DEVICE };
    const { index } = withdrawEntry(
      { entries: [OLD, targeted] },
      { id: targeted.id, reason: 'bad boot' },
      MOMENT,
    );
    expect(latestAppUpdate(index.entries, TARGET)?.id).toBe(OLD.id);
    expect(latestAppUpdate(index.entries, { ...TARGET, clientId: DEVICE })).toMatchObject({
      id: NEW,
      clientId: DEVICE,
      files: OLD.files,
    });
  });
  it('withdraws the newest and republishes the previous one newer than the withdrawn one', () => {
    const { index, result } = rollbackEntries({ entries: [OLD, NEWER] }, REQUEST, MOMENT);
    expect(index.entries).toHaveLength(3);
    const withdrawn = index.entries.find((one) => one.id === B);
    expect(withdrawn?.withdrawn).toEqual({ at: NOW.toISOString(), reason: 'bad boot' });
    const offered = latestAppUpdate(index.entries, TARGET);
    expect(offered).toMatchObject({ id: NEW, files: OLD.files, notes: OLD.notes, withdrawn: null });
    expect(Date.parse(offered?.createdAt ?? '')).toBeGreaterThan(Date.parse(NEWER.createdAt));
    expect(result.entries.map((one) => one.id)).toEqual([B, NEW]);
    expect(rollsBackToEmbedded(index.entries, TARGET, B)).toBe(false);
  });

  it('skips entries that are already withdrawn when it picks the previous one', () => {
    const gone = entry(C, '2026-10-25T10:30:00.000Z', {
      withdrawn: { at: '2026-10-25T10:40:00.000Z', reason: 'x' },
    });
    const { index } = rollbackEntries({ entries: [OLD, gone, NEWER] }, REQUEST, MOMENT);
    expect(latestAppUpdate(index.entries, TARGET)?.files).toEqual(OLD.files);
  });

  it('only withdraws when no earlier entry exists, so clients go back to the embedded build', () => {
    const { index } = rollbackEntries({ entries: [NEWER] }, REQUEST, MOMENT);
    expect(index.entries).toHaveLength(1);
    expect(latestAppUpdate(index.entries, TARGET)).toBeNull();
    expect(rollsBackToEmbedded(index.entries, TARGET, B)).toBe(true);
  });

  it('leaves nothing offerable with toEmbedded and spares other runtimes and channels', () => {
    const other = entry(C, '2026-10-25T09:00:00.000Z', { runtimeVersion: 'rt-2' });
    const release = entry(NEW.replace('9', '8'), '2026-10-25T09:00:00.000Z', {
      channel: 'release',
    });
    const { index, result } = rollbackEntries(
      { entries: [OLD, NEWER, other, release] },
      { ...REQUEST, toEmbedded: true },
      MOMENT,
    );
    expect(index.entries).toHaveLength(4);
    expect(latestAppUpdate(index.entries, TARGET)).toBeNull();
    expect(result.entries.map((one) => one.id)).toEqual([A, B]);
    expect(index.entries.find((one) => one.id === C)?.withdrawn).toBeNull();
    expect(index.entries.find((one) => one.id === release.id)?.withdrawn).toBeNull();
    expect(rollsBackToEmbedded(index.entries, TARGET, B)).toBe(true);
  });

  it('names the channel when nothing is left to roll back', () => {
    expect(() => rollbackEntries({ entries: [] }, REQUEST, MOMENT)).toThrow(NothingToRollBackError);
    const gone = entry(A, '2026-10-25T10:00:00.000Z', {
      withdrawn: { at: NOW.toISOString(), reason: 'x' },
    });
    expect(() => rollbackEntries({ entries: [gone] }, REQUEST, MOMENT)).toThrow(/desktop dev/u);
  });

  it('refuses to republish with a time that is not newer than the withdrawn entry', () => {
    const behind = { id: NEW, now: new Date('2026-10-25T10:30:00.000Z') };
    expect(() => rollbackEntries({ entries: [OLD, NEWER] }, REQUEST, behind)).toThrow(
      ClockBehindError,
    );
  });
});

describe('promoteEntry', () => {
  it('copies the entry to the channel with a new id and time and the same blobs', () => {
    const { index, result } = promoteEntry(
      { entries: [OLD] },
      { id: A, channel: 'release' },
      MOMENT,
    );
    expect(index.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual({
      ...OLD,
      id: NEW,
      channel: 'release',
      createdAt: NOW.toISOString(),
    });
    expect(index.entries[0]).toEqual(OLD);
  });

  it('names an id that does not exist and refuses a withdrawn entry', () => {
    expect(() => promoteEntry({ entries: [OLD] }, { id: B, channel: 'release' }, MOMENT)).toThrow(
      UpdateNotFoundError,
    );
    const gone = { ...OLD, withdrawn: { at: NOW.toISOString(), reason: 'broken' } };
    expect(() => promoteEntry({ entries: [gone] }, { id: A, channel: 'release' }, MOMENT)).toThrow(
      /broken/u,
    );
  });
});

describe('withdrawEntry', () => {
  it('marks only an older entry with the reason and time and republishes nothing', () => {
    const { index, result } = withdrawEntry(
      { entries: [OLD, NEWER] },
      { id: A, reason: 'why' },
      MOMENT,
    );
    expect(index.entries).toHaveLength(2);
    expect(index.entries[0]?.withdrawn).toEqual({ at: NOW.toISOString(), reason: 'why' });
    expect(index.entries[1]).toEqual(NEWER);
    expect(result.entries.map((one) => one.id)).toEqual([A]);
  });

  it('rolls back when the entry is the newest of its target, so clients accept the older one', () => {
    const { index, result } = withdrawEntry(
      { entries: [OLD, NEWER] },
      { id: B, reason: 'bad boot' },
      MOMENT,
    );
    expect(index.entries).toHaveLength(3);
    expect(index.entries.find((one) => one.id === B)?.withdrawn).toEqual({
      at: NOW.toISOString(),
      reason: 'bad boot',
    });
    const offered = latestAppUpdate(index.entries, TARGET);
    expect(offered).toMatchObject({ id: NEW, files: OLD.files, withdrawn: null });
    expect(Date.parse(offered?.createdAt ?? '')).toBeGreaterThan(Date.parse(NEWER.createdAt));
    expect(result.entries.map((one) => one.id)).toEqual([B, NEW]);
  });

  it('goes back to the embedded build when the newest entry has nothing before it', () => {
    const { index } = withdrawEntry({ entries: [NEWER] }, { id: B, reason: 'r' }, MOMENT);
    expect(index.entries).toHaveLength(1);
    expect(latestAppUpdate(index.entries, TARGET)).toBeNull();
    expect(rollsBackToEmbedded(index.entries, TARGET, B)).toBe(true);
  });

  it('only compares entries of the same runtime, channel and platform', () => {
    const other = entry(C, '2026-10-25T11:30:00.000Z', { runtimeVersion: 'rt-2' });
    const { index } = withdrawEntry(
      { entries: [OLD, NEWER, other] },
      { id: A, reason: 'r' },
      MOMENT,
    );
    expect(index.entries).toHaveLength(3);
    expect(latestAppUpdate(index.entries, TARGET)).toMatchObject({ id: B });
  });

  it('refuses a missing id and an entry that is already withdrawn', () => {
    expect(() => withdrawEntry({ entries: [] }, { id: A, reason: 'r' }, MOMENT)).toThrow(
      UpdateNotFoundError,
    );
    const gone = { ...OLD, withdrawn: { at: NOW.toISOString(), reason: 'first' } };
    expect(() => withdrawEntry({ entries: [gone] }, { id: A, reason: 'r' }, MOMENT)).toThrow(
      UpdateWithdrawnError,
    );
  });
});

describe('with the store', () => {
  let data: HubLayout;
  let base = '';
  let scratch = '';

  beforeEach(async () => {
    base = mkdtempSync(join(tmpdir(), 'update-actions-data-'));
    data = await testLayout(base);
    scratch = mkdtempSync(join(tmpdir(), 'update-actions-source-'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });

  it('keeps shared blobs after a promote, a withdraw and a prune, and keeps every referenced blob', async () => {
    const written = await Promise.all(
      ['one', 'two'].map((text) => {
        const source = join(scratch, text);
        writeFileSync(source, text);
        return writeBlob(data, { source, path: `${text}.html`, contentType: 'text/html' });
      }),
    );
    await appendEntry(data, entry(A, '2026-10-25T10:00:00.000Z', { files: written }));
    await updateIndex(data, (index) => promoteEntry(index, { id: A, channel: 'release' }, MOMENT));
    await updateIndex(data, (index) => withdrawEntry(index, { id: A, reason: 'r' }, MOMENT));
    writeFileSync(join(blobFolder(data), 'd'.repeat(64)), 'orphan');
    writeFileSync(join(blobFolder(data), `${'c'.repeat(64)}.part`), 'half');
    const removed = await pruneBlobs(data);
    expect(removed).toEqual([`${'c'.repeat(64)}.part`, 'd'.repeat(64)]);
    const index = await readIndex(data);
    expect(index.entries).toHaveLength(2);
    expect(await pruneBlobs(data)).toEqual([]);
    const kept = new Set(index.entries.flatMap((one) => one.files.map((file) => file.sha256)));
    expect(kept.size).toBe(2);
    for (const hash of kept) {
      expect(existsSync(blobFile(data, hash))).toBe(true);
    }
  });

  it('keeps the old index when a change throws', async () => {
    await appendEntry(data, OLD);
    await expect(
      updateIndex(data, (index) => withdrawEntry(index, { id: B, reason: 'r' }, MOMENT)),
    ).rejects.toThrow(UpdateNotFoundError);
    expect((await readIndex(data)).entries).toEqual([OLD]);
  });
});
