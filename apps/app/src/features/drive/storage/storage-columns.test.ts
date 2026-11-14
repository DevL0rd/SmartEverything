import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRIVE_STATS,
  DRIVE_USAGE,
  type DriveStats,
  type DriveUsage,
} from '@smarteverything/domain';

const GB = 1024 ** 3;
const ME = '00000000-0000-4000-8000-0000000000a1';
const SAM = '00000000-0000-4000-8000-0000000000b1';

interface Seen {
  width: number;
  usage: readonly DriveUsage[] | undefined;
  people: unknown;
}

const seen = vi.hoisted((): Seen => ({ width: 1000, usage: undefined, people: null }));

function usage(profileId: string | null, live: number): DriveUsage {
  return DRIVE_USAGE.parse({
    profileId,
    items: 3,
    folders: 1,
    live: live * GB,
    versions: 0,
    trash: 0,
  });
}

function part(name: string): () => ReactNode {
  return function Part(): ReactNode {
    return createElement('i', { 'data-part': name });
  };
}

vi.mock('../../../components/section-body', () => ({
  useFrameBodyWidth: (): number => seen.width,
}));
vi.mock('../../../store/people', () => ({
  useProfiles: (): readonly unknown[] => [
    { id: ME, name: 'Dana', colour: 'aqua' },
    { id: SAM, name: 'Sam', colour: 'rose' },
  ],
}));
vi.mock('../data', () => ({
  useDriveUsage: (): { readonly data: readonly DriveUsage[] | undefined } => ({ data: seen.usage }),
  useDriveQuotas: (enabled: boolean): { readonly data: readonly unknown[] | undefined } => ({
    data: enabled ? [] : undefined,
  }),
  useViewerId: (): string => ME,
  useSharedDrive: (): null => null,
}));
vi.mock('../../../components/empty-state', () => ({ EmptyState: part('empty') }));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('./storage-hero', () => ({ StorageHero: part('disk'), KindsCard: part('kinds') }));
vi.mock('./by-drive', () => ({ ByDrive: part('drives') }));
vi.mock('./people-card', () => ({
  PeopleCard: ({ people }: { readonly people: unknown }): ReactNode => {
    seen.people = people;
    return createElement('i', { 'data-part': 'people' });
  },
}));
vi.mock('./purge-bars', () => ({ PurgeBars: part('purges') }));
vi.mock('./health-card', () => ({ HealthCard: part('health') }));
vi.mock('./duplicate-group-row', () => ({ StorageDuplicates: part('duplicates') }));
vi.mock('./largest-files', () => ({ LargestFiles: part('largest') }));

function stats(items: number): DriveStats {
  return DRIVE_STATS.parse({
    items,
    folders: 0,
    bytes: 10 * GB,
    liveBytes: 10 * GB,
    versionBytes: 0,
    trashBytes: 0,
    kinds: [],
    roots: [],
    space: { totalBytes: 1000 * GB, freeBytes: 500 * GB, fsType: 'ext4' },
    fullInMonths: null,
    purges: [],
    growth: null,
  });
}

async function parts(owner: boolean, items = 5): Promise<readonly string[]> {
  const { StorageColumns } = await import('./storage-columns');
  const html = renderToStaticMarkup(createElement(StorageColumns, { stats: stats(items), owner }));
  return [...html.matchAll(/data-part="([^"]+)"/gu)].map((match) => match[1] ?? '');
}

beforeEach(() => {
  seen.width = 1000;
  seen.usage = [usage(ME, 10), usage(SAM, 40), usage(null, 5)];
  seen.people = null;
});

describe('Storage columns', () => {
  it('gives the owner the People totals beside the disk, drives, kinds and freeing', async () => {
    expect(await parts(true)).toEqual([
      'disk',
      'drives',
      'people',
      'kinds',
      'purges',
      'health',
      'duplicates',
      'largest',
    ]);
    expect(seen.people).toMatchObject([
      { person: { name: 'Sam' }, you: false, usage: { live: 40 * GB } },
      { person: { name: 'Dana' }, you: true, usage: { live: 10 * GB } },
    ]);
  });

  it('never shows a member the People list', async () => {
    expect(await parts(false)).not.toContain('people');
  });

  it('shows the empty state instead of kinds, duplicates and largest files when nothing is stored', async () => {
    expect(await parts(false, 0)).toEqual(['disk', 'drives', 'empty', 'purges', 'health']);
  });
});
