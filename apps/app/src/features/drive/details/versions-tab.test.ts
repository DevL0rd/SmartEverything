import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM, DRIVE_VERSION, type DriveVersion } from '@smarteverything/domain';
import { FOLDER_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';

interface Passed {
  readonly children?: ReactNode;
}

interface ButtonPassed {
  readonly label: string;
  readonly variant?: string;
  readonly disabled?: boolean;
}

interface Hub {
  versions: readonly DriveVersion[] | null;
  conflicted: boolean;
  live: boolean;
  error: boolean;
}

const hub = vi.hoisted((): Hub => ({
  versions: null,
  conflicted: false,
  live: true,
  error: false,
}));

vi.mock('react-native', () => ({
  View: ({ children }: Passed): ReactNode => createElement('div', {}, children),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label, variant = 'filled', disabled = false }: ButtonPassed): ReactNode =>
    createElement('button', { 'data-variant': variant, disabled }, label),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: Passed): ReactNode => createElement('p', {}, children),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title }: { readonly title: string }): ReactNode => createElement('h2', {}, title),
}));
vi.mock('../../../components/error-state', () => ({
  ErrorState: (): ReactNode => 'error-state',
}));
vi.mock('../../../components/toast-store', () => ({
  notifyFailure: (): (() => void) => () => undefined,
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: hub.live ? 'live' : 'offline' }),
}));
vi.mock('../versions/restore', () => ({
  restoreVersion: (): Promise<boolean> => Promise.resolve(true),
}));
vi.mock('../versions/versions-sheet', () => ({ VersionsSheet: (): null => null }));
vi.mock('../versions/version-timeline', () => ({
  CompactTimeline: ({ entries }: { readonly entries: readonly unknown[] }): ReactNode =>
    `timeline:${String(entries.length)}`,
  OneVersion: (): ReactNode => 'one-version',
  SizeOverYear: ({ total }: { readonly total: string }): ReactNode => `size:${total}`,
  TimelineLoading: (): ReactNode => 'loading',
  useTimelineLook: (): object => ({
    time: { now: Date.parse('2026-11-07T12:00:00.000Z'), zone: 'UTC' },
  }),
}));
vi.mock('../../nas/data', () => ({
  flattenPages: <T>(
    data: { readonly pages: readonly { readonly items: readonly T[] }[] } | undefined,
  ): readonly T[] => (data === undefined ? [] : data.pages.flatMap((page) => page.items)),
  useDriveVersions: (): object => ({
    data: hub.versions === null ? undefined : { pages: [{ items: hub.versions, next: null }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: hub.error,
    fetchNextPage: (): Promise<void> => Promise.resolve(),
  }),
  useDriveConflicts: (): object => ({
    data: {
      pages: [
        {
          items: hub.conflicted ? [{ itemId: ITEM_ID, resolvedAt: null }] : [],
          next: null,
        },
      ],
    },
  }),
}));

const { VersionsTab, restoreLineOf } = await import('./versions-tab');
const { CONFLICT_FOOTER, RESTORE_FOOTER, entriesOf } = await import('../versions/versions-model');

const ITEM_ID = 'f1b2c3d4-0000-4000-8000-000000000001';

const item = DRIVE_ITEM.parse({
  id: ITEM_ID,
  rootId: ROOT_ID,
  parentId: FOLDER_ID,
  relPath: 'Home/Notes.md',
  name: 'Notes.md',
  modifiedAt: '2026-11-07T09:10:00.000Z',
  addedAt: '2026-11-02T09:10:00.000Z',
  openedAt: null,
  starred: false,
  rev: 3,
  etag: 'etag',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
  kind: 'document',
  mime: 'text/markdown',
  bytes: 1200,
  sha256: null,
  integrity: 'unknown',
  thumb: { state: 'none' },
});

function version(rev: number, at: string): DriveVersion {
  return DRIVE_VERSION.parse({
    id: `f1b2c3d4-0000-4000-8000-00000000010${String(rev)}`,
    itemId: ITEM_ID,
    rev,
    sha256: 'a'.repeat(64),
    bytes: 1000,
    at,
    purgeAt: '2027-11-07T09:10:00.000Z',
    actorProfileId: null,
    via: 'ai',
    deviceId: null,
    addedByProfileId: null,
  });
}

const TWO = [version(2, '2026-11-06T09:10:00.000Z'), version(1, '2026-11-03T09:10:00.000Z')];

function render(writable = true): string {
  const subject = { root: rootRow(ROOT_ID, 'ready'), item, writable };
  return renderToStaticMarkup(createElement(VersionsTab, { subject }));
}

beforeEach(() => {
  hub.versions = null;
  hub.conflicted = false;
  hub.live = true;
  hub.error = false;
});

describe('versions tab', () => {
  it('lists every version with Compare and Restore as the primary', () => {
    hub.versions = TWO;
    const html = render();
    expect(html).toContain('timeline:3');
    expect(html).toContain('size:3 versions');
    expect(html).toContain('<button data-variant="tonal">Compare</button>');
    expect(html).toContain('<button data-variant="filled">Restore</button>');
    expect(html).toContain(RESTORE_FOOTER);
  });

  it('demotes Restore while a conflict is open', () => {
    hub.versions = TWO;
    hub.conflicted = true;
    const html = render();
    expect(html).toContain('<button data-variant="filled">Compare</button>');
    expect(html).toContain('<button data-variant="text">Restore</button>');
    expect(html).toContain(CONFLICT_FOOTER);
  });

  it('keeps Restore off where the file cannot be changed', () => {
    hub.versions = TWO;
    expect(render(false)).toContain('<button data-variant="filled" disabled="">Restore</button>');
  });

  it('says so when the file has one version', () => {
    hub.versions = [];
    expect(render()).toContain('one-version');
  });

  it('shows loading, the hub error and the offline hub before versions arrive', () => {
    expect(render()).toContain('loading');
    hub.error = true;
    expect(render()).toContain('error-state');
    hub.live = false;
    expect(render()).toContain('The hub is offline');
  });

  it('names the version Restore brings back', () => {
    const [, earlier] = entriesOf(item, TWO);
    if (earlier === undefined) throw new Error('missing version');
    const time = { now: Date.parse('2026-11-07T12:00:00.000Z'), zone: 'UTC' };
    expect(restoreLineOf(earlier, false, time)).toMatch(/^Restores the version from .+\. /);
    expect(restoreLineOf(earlier, true, time)).toBe(CONFLICT_FOOTER);
  });
});
