import { QueryClient } from '@tanstack/react-query';
import type { PhotosProgressNotice } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { driveKey, DRIVE_EVERYWHERE } from '../../../queries/keys';
import { ROOT_ID } from './fixtures';
import { onPhotosProgress, receivePhotosProgress } from './live';
import { invalidateDriveChanged, narrowDriveWindowsByMonth } from './windows';

const SCOPE = { filter: 'all', placeId: null };
const MONTH_KEY = (month: string): readonly unknown[] =>
  driveKey('photo-month', DRIVE_EVERYWHERE, month, SCOPE);
const BUCKETS = driveKey('photo-buckets', DRIVE_EVERYWHERE, SCOPE);

function notice(months: readonly string[]): Parameters<typeof invalidateDriveChanged>[1] {
  return {
    type: 'drive_changed',
    rootIds: [ROOT_ID],
    folderIds: [],
    albumIds: [],
    months,
    cursor: 1,
  };
}

function seeded(): QueryClient {
  const client = new QueryClient();
  for (const key of [MONTH_KEY('2026-03'), MONTH_KEY('2026-04'), BUCKETS]) {
    client.setQueryData(key, 'data');
  }
  return client;
}

function stale(client: QueryClient, key: readonly unknown[]): boolean {
  return client.getQueryState(key)?.isInvalidated === true;
}

const releases: (() => void)[] = [];

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

describe('Photos month windows', () => {
  it('refetch only the months a drive_changed notice names', () => {
    releases.push(
      narrowDriveWindowsByMonth('photo-month', ([month], months) => months.includes(String(month))),
    );
    const client = seeded();
    invalidateDriveChanged(client, notice(['2026-04']));
    expect(stale(client, MONTH_KEY('2026-04'))).toBe(true);
    expect(stale(client, MONTH_KEY('2026-03'))).toBe(false);
    expect(stale(client, BUCKETS)).toBe(true);
  });

  it('leave every month alone when the change touched no photo', () => {
    releases.push(
      narrowDriveWindowsByMonth('photo-month', ([month], months) => months.includes(String(month))),
    );
    const client = seeded();
    invalidateDriveChanged(client, notice([]));
    expect(stale(client, MONTH_KEY('2026-03'))).toBe(false);
    expect(stale(client, MONTH_KEY('2026-04'))).toBe(false);
  });

  it('allow exactly one narrowing per window kind and release it', () => {
    const release = narrowDriveWindowsByMonth('photo-month', () => true);
    expect(() => narrowDriveWindowsByMonth('photo-month', () => false)).toThrow(/exactly one/);
    release();
    releases.push(narrowDriveWindowsByMonth('photo-month', () => false));
  });
});

describe('Photos progress listeners', () => {
  const progress: PhotosProgressNotice = {
    type: 'photos_progress',
    kind: 'preview',
    done: 1,
    total: 2,
  };

  it('hear each notice until they unsubscribe', () => {
    const heard: PhotosProgressNotice[] = [];
    const off = onPhotosProgress((message) => heard.push(message));
    receivePhotosProgress(progress);
    off();
    receivePhotosProgress(progress);
    expect(heard).toStrictEqual([progress]);
  });
});
