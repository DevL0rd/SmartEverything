import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PhotoInsights, PhotoRailCounts } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarSegment } from '../../../components/charts';
import type { TabItem } from '../../../components/tabs-bar';
import { bytes } from '../../../format/number';
import type { LibraryFrameProps, LibrarySectionGroup } from '../../nas/frame';
import { INITIAL_BACKUP_STATUS, type BackupStatus } from '../backup/model/status';
import type { PhotosFrameProps, PhotosRailView } from './photos-frame';

interface Seen {
  owner: boolean;
  phone: boolean;
  area: number;
  counts: PhotoRailCounts | undefined;
  insights: PhotoInsights | undefined;
  status: BackupStatus;
  frame: LibraryFrameProps | null;
  segments: readonly BarSegment[] | null;
}

const seen = vi.hoisted((): Seen => ({
  owner: true,
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

vi.mock('../../../store/selectors', () => ({ useIsOwner: (): boolean => seen.owner }));
vi.mock('../../../design/platform', () => ({ isNative: (): boolean => seen.phone }));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => seen.area }));
vi.mock('../backup/model/status', async (original) => ({
  ...(await original<object>()),
  useBackupStatus: (): BackupStatus => seen.status,
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
vi.mock('../../../components/tabs-bar', () => ({
  TabsBar: (): null => null,
}));
vi.mock('../../nas/frame', () => ({
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
  timeline: 48213,
  memories: 5,
  albums: 24,
  places: 41,
  favourites: 1204,
  videos: 2318,
  screenshots: 3940,
  cameras: 812,
  ai: 96,
  duplicates: 37,
  backupPhones: 3,
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

const WIDE: PhotosRailView = {
  counts: COUNTS,
  insights: INSIGHTS,
  owner: true,
  phone: false,
  compact: false,
  phoneLeft: null,
};

const COMPACT: PhotosRailView = { ...WIDE, phone: true, compact: true, phoneLeft: 34 };

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

const PROPS: PhotosFrameProps = { active: 'videos', children: createElement('p', {}, 'Body') };

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
  seen.owner = true;
  seen.phone = false;
  seen.area = 1360;
  seen.counts = undefined;
  seen.insights = undefined;
  seen.status = INITIAL_BACKUP_STATUS;
  seen.frame = null;
  seen.segments = null;
});

describe('photos rail', () => {
  it('lists every section in the designed groups for the owner', () => {
    const groups = photosRailGroups(WIDE);
    expect(groups.map((group) => group.title)).toEqual([null, 'Library', 'Manage']);
    expect(groups.flatMap((group) => group.sections.map((section) => section.label))).toEqual([
      'Timeline',
      'Search',
      'Memories',
      'Albums',
      'Map and places',
      'Favourites',
      'Videos',
      'Screenshots',
      'Cameras',
      'Made with AI',
      'Duplicates',
      'Backup',
      'Insights',
      'Recently deleted',
    ]);
  });

  it('leaves Duplicates out for a member', () => {
    const groups = photosRailGroups({ ...WIDE, owner: false });
    expect(groups[2]?.sections.map((section) => section.id)).toEqual([
      'backup',
      'insights',
      'deleted',
    ]);
  });

  it('puts a summary line under each wide rail row and no trailing count', () => {
    const groups = photosRailGroups(WIDE);
    expect(Object.values(countsOf(groups)).every((value) => value === null)).toBe(true);
    expect(detailsOf(groups)).toMatchObject({
      timeline: '<div><span>48,213 items</span></div>',
      albums: '<div><span>24 albums</span></div>',
      duplicates: '<div><span>37 groups</span></div>',
      backup: '<div><span>3 devices</span></div>',
    });
  });

  it('builds the summaries from the hub counts and the library insights', () => {
    expect(railSummaryOf('videos', WIDE)).toBe('2,318 · 61 h');
    expect(railSummaryOf('insights', WIDE)).toBe('41 places · 2 countries');
    expect(railSummaryOf('memories', WIDE)).toBe('5 memories');
    expect(railSummaryOf('deleted', WIDE)).toBe('214 items');
    expect(railSummaryOf('favourites', WIDE)).toBe('1,204');
    expect(railSummaryOf('search', WIDE)).toBe('Places, dates, what is in it');
    expect(railSummaryOf('videos', { ...WIDE, insights: undefined })).toBe('2,318');
  });

  it('keeps every number blank until the counts answer', () => {
    const view = { ...WIDE, counts: undefined, insights: undefined };
    const details = detailsOf(photosRailGroups(view));
    expect(Object.entries(details).filter(([, text]) => text !== '')).toEqual([
      ['search', '<div><span>Places, dates, what is in it</span></div>'],
    ]);
    const counts = countsOf(photosRailGroups({ ...view, compact: true }));
    expect(Object.values(counts).every((value) => value === null)).toBe(true);
  });

  it('gives the phone pull-up trailing counts with what is left on this phone', () => {
    expect(countsOf(photosRailGroups(COMPACT))).toMatchObject({
      timeline: 48213,
      map: 41,
      duplicates: '37 groups',
      backup: '34 left',
      search: null,
      insights: null,
    });
    expect(countsOf(photosRailGroups({ ...COMPACT, phoneLeft: 0 }))['backup']).toBeNull();
    expect(photosRailGroups(COMPACT)[0]?.sections[0]?.detail).toBeUndefined();
  });

  it('links every section and names the page after it', () => {
    expect(photosHrefOf('timeline')).toBe('/photos');
    expect(photosHrefOf('albums')).toEqual({ pathname: '/photos/albums', params: {} });
    expect(photosHrefOf('deleted')).toEqual({ pathname: '/photos/deleted', params: {} });
    expect(() => photosHrefOf('people')).toThrow();
    expect(photosTitleOf('timeline')).toBe('Photos');
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
    expect(seen.frame?.title).toBe('Videos');
    expect(seen.frame?.active).toBe('videos');
    expect(seen.frame?.hrefOf('backup')).toEqual({ pathname: '/photos/backup', params: {} });
    expect(markup).toBe('<main><aside>Library</aside><p>Body</p></main>');
    expect(seen.segments).toBeNull();
  });

  it('fills the rail well with the library size and the phones count on a desktop', () => {
    seen.counts = COUNTS;
    seen.insights = INSIGHTS;
    const markup = render();
    expect(markup).toContain(bytes(2048));
    expect(markup).toContain('3 devices back up here');
    expect(seen.segments?.[0]?.value).toBe(2048);
  });

  it('gives the phone pull-up the items, size and this phone, and hides Duplicates from a member', () => {
    seen.phone = true;
    seen.area = 412;
    seen.owner = false;
    seen.counts = { ...COUNTS, duplicates: null };
    seen.insights = INSIGHTS;
    seen.status = UPLOADING;
    const markup = render();
    expect(markup).toContain('<aside>Photos<span>This device: 34 left</span>');
    expect(markup).toContain(`48,213 items · ${bytes(2048)}`);
    expect(markup).toContain('Backing up');
    expect(seen.segments).toBeNull();
    const ids = seen.frame?.sections.flatMap((group) =>
      group.sections.map((section) => section.id),
    );
    expect(ids).not.toContain('duplicates');
  });

  it('gives the phone the Timeline, Memories, Albums and Places tabs on a section page', () => {
    render({ active: 'albums', children: null });
    const tabs = tabsOf(seen.frame?.chips);
    expect(tabs?.active).toBe('albums');
    expect(tabs?.items.map((item) => [item.label, item.href])).toEqual([
      ['Timeline', '/photos'],
      ['Memories', { pathname: '/photos/memories', params: {} }],
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
