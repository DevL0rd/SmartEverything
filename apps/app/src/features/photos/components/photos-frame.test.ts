import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PhotoInsights, PhotoRailCounts } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarSegment } from '../../../components/charts';
import type { TabItem } from '../../../components/tabs-bar';
import { bytes } from '../../../format/number';
import type { LibraryFrameProps, LibrarySectionGroup } from '../../../components/library-frame';
import { INITIAL_BACKUP_STATUS, type BackupStatus } from '../backup/model/status';
import type { PhotosFrameProps, PhotosRailView } from './photos-frame';

interface Seen {
  phone: boolean;
  area: number;
  counts: PhotoRailCounts | undefined;
  insights: PhotoInsights | undefined;
  status: BackupStatus;
  frame: LibraryFrameProps | null;
  segments: readonly BarSegment[] | null;
}

const seen = vi.hoisted((): Seen => ({
  phone: false,
  area: 1360,
  counts: undefined,
  insights: undefined,
  status: {
    phase: 'off',
    pauseReason: null,
    limitedAccess: false,
    total: 0,
    done: 0,
    failed: 0,
    bytesLeft: 0,
    current: null,
    lastBackupAt: null,
    problem: null,
  },
  frame: null,
  segments: null,
}));

vi.mock('../../../design/platform', () => ({ isNative: (): boolean => seen.phone }));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => seen.area }));
vi.mock('../backup/model/status', async (original) => ({
  ...(await original<object>()),
  useBackupStatus: (): BackupStatus => seen.status,
}));
vi.mock('../../drive', () => ({
  useLibraryRefresh: (): { readonly refreshing: boolean; readonly refresh: () => void } => ({
    refreshing: false,
    refresh: (): void => undefined,
  }),
}));
vi.mock('../../../app-shell/main-pages', () => ({
  mainPageSettings: (): { readonly href: string; readonly label: string } => ({
    href: '/settings/photos',
    label: 'Photos settings',
  }),
}));
vi.mock('../data', () => ({
  usePhotoRailCounts: (): { readonly data: PhotoRailCounts | undefined } => ({
    data: seen.counts,
  }),
  usePhotoInsights: (): { readonly data: PhotoInsights | undefined } => ({
    data: seen.insights,
  }),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', {}, children),
}));
vi.mock('../../../components/charts', () => ({
  SegmentBar: ({ segments }: { readonly segments: readonly BarSegment[] }): null => {
    seen.segments = segments;
    return null;
  },
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/interactive', () => ({
  Interactive: ({
    href,
    children,
  }: {
    readonly href: unknown;
    readonly children: ReactNode;
  }): ReactNode => createElement('a', { 'data-href': JSON.stringify(href) }, children),
}));
vi.mock('../../../components/tabs-bar', () => ({
  TabsBar: (): null => null,
}));
vi.mock('../../../components/library-frame', () => ({
  LibraryFrame: (props: LibraryFrameProps): ReactNode => {
    seen.frame = props;
    return createElement('main', {}, props.summary, props.children);
  },
  SummaryWell: ({
    title,
    trailing,
    children,
  }: {
    readonly title: string;
    readonly trailing: ReactNode;
    readonly children: ReactNode;
  }): ReactNode => createElement('aside', {}, title, trailing, children),
}));

const {
  PHOTOS_PHONE_TABS,
  PhotosFrame,
  backupLinesOf,
  librarySegmentsOf,
  phoneLeftOf,
  photosHrefOf,
  photosRailGroups,
  photosTitleOf,
  railSummaryOf,
} = await import('./photos-frame');

const COUNTS: PhotoRailCounts = {
  library: 48213,
  albums: 24,
  places: 41,
  favourites: 1204,
  videos: 2318,
  screenshots: 3940,
  duplicates: 37,
  backupDevices: 3,
  deleted: 214,
};

const INSIGHTS: PhotoInsights = {
  range: 'all_time',
  items: 1,
  bytes: 2048,
  kinds: [{ kind: 'photo', items: 1, bytes: 2048 }],
  growth: null,
  cameras: [],
  lenses: [],
  roots: [],
  largestVideos: [],
  videoTotals: { items: 2318, bytes: 0, durationMs: 61 * 3_600_000, longestMs: null },
  durationBuckets: [],
  hoursAddedPerMonth: null,
  busiestDays: [],
  perDay: [],
  weekdayByHour: [],
  seasonByHour: [],
  places: {
    places: 41,
    countries: [
      { countryCode: 'GB', country: 'United Kingdom', items: 900 },
      { countryCode: 'JP', country: 'Japan', items: 412 },
    ],
  },
  backupCoverage: [],
};

const UPLOADING: BackupStatus = {
  ...INITIAL_BACKUP_STATUS,
  phase: 'uploading',
  total: 40,
  done: 6,
};

const WIDE: PhotosRailView = { counts: COUNTS, insights: INSIGHTS, compact: false };

const COMPACT: PhotosRailView = { ...WIDE, compact: true };

const BACKUP_HREF = JSON.stringify({
  pathname: '/settings/[...page]',
  params: { page: ['photos', 'backup'] },
});

function countsOf(groups: readonly LibrarySectionGroup[]): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    groups.flatMap((group) => group.sections.map((section) => [section.id, section.count])),
  );
}

function detailsOf(groups: readonly LibrarySectionGroup[]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    groups.flatMap((group) =>
      group.sections.map((section) => [
        section.id,
        section.detail === undefined
          ? ''
          : renderToStaticMarkup(createElement('div', {}, section.detail)),
      ]),
    ),
  );
}

const PROPS: PhotosFrameProps = { active: 'insights', children: createElement('p', {}, 'Body') };

function render(props: PhotosFrameProps = PROPS): string {
  return renderToStaticMarkup(createElement(PhotosFrame, props));
}

interface TabsSeen {
  readonly items: readonly TabItem[];
  readonly active: string;
}

function tabsOf(chips: ReactNode): TabsSeen | null {
  if (!isValidElement<TabsSeen>(chips)) return null;
  return { items: chips.props.items, active: chips.props.active };
}

beforeEach(() => {
  seen.phone = false;
  seen.area = 1360;
  seen.counts = undefined;
  seen.insights = undefined;
  seen.status = INITIAL_BACKUP_STATUS;
  seen.frame = null;
  seen.segments = null;
});

describe('photos rail', () => {
  it('lists Library, Albums and Map and places on top and the Manage group under them', () => {
    const groups = photosRailGroups(WIDE);
    expect(groups.map((group) => group.title)).toEqual([null, 'Manage']);
    expect(
      groups.map((group) => group.sections.map((section) => [section.id, section.label])),
    ).toEqual([
      [
        ['library', 'Library'],
        ['albums', 'Albums'],
        ['map', 'Map and places'],
      ],
      [
        ['insights', 'Insights'],
        ['deleted', 'Recently deleted'],
      ],
    ]);
  });

  it('keeps search, memories, the browsing filters, duplicates and backup out of the rail', () => {
    const ids = photosRailGroups(WIDE).flatMap((group) =>
      group.sections.map((section) => section.id),
    );
    for (const gone of [
      'timeline',
      'search',
      'memories',
      'favourites',
      'videos',
      'screenshots',
      'cameras',
      'ai',
      'duplicates',
      'backup',
    ]) {
      expect(ids).not.toContain(gone);
    }
  });

  it('puts a summary line under each wide rail row and no trailing count', () => {
    const groups = photosRailGroups(WIDE);
    expect(Object.values(countsOf(groups)).every((value) => value === null)).toBe(true);
    expect(detailsOf(groups)).toEqual({
      library: '<div><span>48,213 items</span></div>',
      albums: '<div><span>24 albums</span></div>',
      map: '<div><span>41 places</span></div>',
      insights: '<div><span>41 places · 2 countries</span></div>',
      deleted: '<div><span>214 items</span></div>',
    });
  });

  it('builds the summaries from the hub counts and the library insights', () => {
    expect(railSummaryOf('insights', WIDE)).toBe('41 places · 2 countries');
    expect(railSummaryOf('deleted', WIDE)).toBe('214 items');
    expect(railSummaryOf('library', { ...WIDE, counts: { ...COUNTS, library: 1 } })).toBe('1 item');
    expect(railSummaryOf('deleted', { ...WIDE, counts: { ...COUNTS, deleted: 0 } })).toBeNull();
  });

  it('keeps every number blank until the counts answer', () => {
    const view = { ...WIDE, counts: undefined, insights: undefined };
    const details = detailsOf(photosRailGroups(view));
    expect(Object.values(details).every((text) => text === '')).toBe(true);
    const counts = countsOf(photosRailGroups({ ...view, compact: true }));
    expect(Object.values(counts).every((value) => value === null)).toBe(true);
  });

  it('gives the phone pull-up trailing counts', () => {
    expect(countsOf(photosRailGroups(COMPACT))).toEqual({
      library: 48213,
      albums: 24,
      map: 41,
      insights: null,
      deleted: 214,
    });
    expect(photosRailGroups(COMPACT)[0]?.sections[0]?.detail).toBeUndefined();
  });

  it('links every section and names the page after it', () => {
    expect(photosHrefOf('library')).toBe('/photos');
    expect(photosHrefOf('albums')).toEqual({ pathname: '/photos/albums', params: {} });
    expect(photosHrefOf('map')).toEqual({ pathname: '/photos/map', params: {} });
    expect(photosHrefOf('deleted')).toEqual({ pathname: '/photos/deleted', params: {} });
    expect(() => photosHrefOf('memories')).toThrow();
    expect(() => photosHrefOf('backup')).toThrow();
    expect(photosTitleOf('library')).toBe('Photos');
    expect(photosTitleOf('deleted')).toBe('Recently deleted');
  });
});

describe('photos summary well', () => {
  it('counts what is left only while this phone backs up', () => {
    expect(phoneLeftOf(INITIAL_BACKUP_STATUS)).toBeNull();
    expect(phoneLeftOf(UPLOADING)).toBe(34);
  });

  it('says what this phone is doing on a phone', () => {
    expect(backupLinesOf(true, UPLOADING, 3)).toEqual({
      headline: 'This device: 34 left',
      state: 'Backing up',
    });
    expect(backupLinesOf(true, { ...UPLOADING, phase: 'paused', pauseReason: 'wifi' }, 3)).toEqual({
      headline: 'This device: 34 left',
      state: 'Waiting for Wi-Fi',
    });
    expect(backupLinesOf(true, { ...UPLOADING, phase: 'idle', done: 40 }, 3).headline).toBe(
      'This device: up to date',
    );
    expect(backupLinesOf(true, INITIAL_BACKUP_STATUS, 3).headline).toBe(
      'Backup is off on this device',
    );
    expect(backupLinesOf(true, { ...INITIAL_BACKUP_STATUS, phase: 'unavailable' }, 3)).toEqual({
      headline: null,
      state: null,
    });
  });

  it('counts the phones that back up on a desktop', () => {
    expect(backupLinesOf(false, UPLOADING, undefined).headline).toBeNull();
    expect(backupLinesOf(false, UPLOADING, 0).headline).toBe('No devices back up here yet');
    expect(backupLinesOf(false, UPLOADING, 1).headline).toBe('1 device backs up here');
    expect(backupLinesOf(false, UPLOADING, 3)).toEqual({
      headline: '3 devices back up here',
      state: null,
    });
  });

  it('splits the library size into photos with screenshots, RAW and videos', () => {
    const segments = librarySegmentsOf([
      { kind: 'photo', items: 10, bytes: 300 },
      { kind: 'screenshot', items: 4, bytes: 60 },
      { kind: 'raw', items: 2, bytes: 50 },
      { kind: 'video', items: 1, bytes: 280 },
    ]);
    expect(segments.map((segment) => [segment.label, segment.value, segment.colour])).toEqual([
      ['Photos', 360, 'viz-1'],
      ['RAW', 50, 'viz-green'],
      ['Videos', 280, 'viz-3'],
    ]);
  });
});

describe('photos frame', () => {
  it('puts the section in the Photos library frame with a blank well before data', () => {
    const markup = render();
    expect(seen.frame?.area).toBe('photos');
    expect(seen.frame?.title).toBe('Insights');
    expect(seen.frame?.active).toBe('insights');
    expect(seen.frame?.hrefOf('map')).toEqual({ pathname: '/photos/map', params: {} });
    expect(markup).toBe('<main><aside>Library</aside><p>Body</p></main>');
    expect(seen.segments).toBeNull();
  });

  it('fills the rail well with the library size and a devices line that opens backup settings', () => {
    seen.counts = COUNTS;
    seen.insights = INSIGHTS;
    const markup = render();
    expect(markup).toContain(bytes(2048));
    expect(markup).toContain(`data-href="${BACKUP_HREF.replaceAll('"', '&quot;')}"`);
    expect(markup).toContain('3 devices back up here');
    expect(seen.segments?.[0]?.value).toBe(2048);
  });

  it('gives the phone pull-up the items and size with this device as a link to backup settings', () => {
    seen.phone = true;
    seen.area = 412;
    seen.counts = COUNTS;
    seen.insights = INSIGHTS;
    seen.status = UPLOADING;
    const markup = render();
    expect(markup).toContain(`<aside>Photos<span>48,213 items · ${bytes(2048)}</span>`);
    expect(markup).toContain(`data-href="${BACKUP_HREF.replaceAll('"', '&quot;')}"`);
    expect(markup).toContain('This device: 34 left · Backing up');
    expect(seen.segments).toBeNull();
  });

  it('leaves the backup link out while nothing is known about backups', () => {
    seen.phone = false;
    seen.counts = undefined;
    expect(render()).not.toContain('data-href');
  });

  it('gives the phone the Library, Albums and Places tabs on a section page', () => {
    render({ active: 'albums', children: null });
    const tabs = tabsOf(seen.frame?.chips);
    expect(tabs?.active).toBe('albums');
    expect(tabs?.items.map((item) => [item.label, item.href])).toEqual([
      ['Library', '/photos'],
      ['Albums', { pathname: '/photos/albums', params: {} }],
      ['Places', { pathname: '/photos/map', params: {} }],
    ]);
    expect(PHOTOS_PHONE_TABS).toBe(tabs?.items);
  });

  it('leaves the tabs off a sub-page that has a breadcrumb back', () => {
    render({
      active: 'albums',
      breadcrumbs: [{ label: 'Albums', href: '/photos/albums' }],
      children: null,
    });
    expect(seen.frame?.chips).toBeUndefined();
  });
});
