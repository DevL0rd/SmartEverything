import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveRoot } from '@smarteverything/domain';
import { COLOUR_VARIABLE, PaletteContext } from '../../../design/colour-roles';
import { bytes } from '../../../format/number';
import { MEMBER_ID, OTHER_ROOT_ID, ROOT_ID, personalRootRow, rootRow } from '../data/fixtures';

const GB = 1_000_000_000;

interface Seen {
  owner: boolean;
  width: 'compact' | 'large';
  progress: object | undefined;
  statsKnown: boolean;
}

const seen = vi.hoisted((): Seen => ({
  owner: false,
  width: 'large',
  progress: undefined,
  statsKnown: true,
}));

vi.mock('../../../design/size-class', async (original) => ({
  ...(await original<object>()),
  useSizeClass: (): { readonly width: Seen['width'] } => ({ width: seen.width }),
}));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => seen.owner,
  useDevices: (): readonly unknown[] => [],
}));
vi.mock('../../../store/people', () => ({
  useProfiles: (): readonly unknown[] => [
    { id: MEMBER_ID, name: 'Robin Vale', colour: 'blue' },
    { id: ROOT_ID, name: 'Sam Lee', colour: 'green' },
  ],
}));
vi.mock('../data', () => ({
  useDrivePlacementRows: (): readonly unknown[] => [],
  useDriveStats: (): { readonly data: unknown } => ({
    data: !seen.statsKnown
      ? undefined
      : {
          roots: [
            {
              rootId: ROOT_ID,
              items: 3,
              folders: 0,
              bytes: 9 * GB,
              kinds: [
                { kind: 'image', items: 2, bytes: 6 * GB },
                { kind: 'video', items: 0, bytes: 0 },
                { kind: 'audio', items: 0, bytes: 0 },
                { kind: 'document', items: 1, bytes: 3 * GB },
                { kind: 'other', items: 0, bytes: 0 },
              ],
            },
          ],
        },
  }),
  useRootProgress: (): object | undefined => seen.progress,
  useDriveConflicts: (): { readonly data: undefined; readonly hasNextPage: boolean } => ({
    data: undefined,
    hasNextPage: false,
  }),
  flattenPages: (): readonly unknown[] => [],
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/charts', () => ({
  ProgressBar: (props: { readonly label: string }): ReactNode =>
    createElement('i', { 'data-bar': props.label }),
  SegmentBar: (props: {
    readonly label: string;
    readonly segments: readonly unknown[];
  }): ReactNode =>
    createElement('i', { 'data-segments': `${props.label}:${String(props.segments.length)}` }),
}));

const { MyDriveHero, SharedDriveHero } = await import('./drive-hero');

const MINE: DriveRoot = { ...personalRootRow(ROOT_ID, MEMBER_ID), items: 3, bytes: 9 * GB };
const HOME: DriveRoot = { ...rootRow(OTHER_ROOT_ID, 'ready'), items: 0, bytes: 0 };

function html(node: ReactNode): string {
  return renderToStaticMarkup(createElement(PaletteContext, { value: COLOUR_VARIABLE }, node));
}

beforeEach(() => {
  seen.statsKnown = true;
  seen.owner = false;
  seen.width = 'large';
  seen.progress = undefined;
});

describe('drive hero card', () => {
  it('shows My Drive by kind with the legend and the quota gauge', () => {
    const markup = html(
      createElement(MyDriveHero, {
        root: MINE,
        use: { used: 9 * GB, quota: { kind: 'limit', bytes: 18 * GB } },
      }),
    );
    expect(markup).toContain('My Drive');
    expect(markup).toContain(`3 files · ${bytes(9 * GB)}`);
    expect(markup).toContain('data-segments="My Drive by kind:2"');
    expect(markup).toContain('data-bar="Space used"');
    expect(markup).toContain('Images');
    expect(markup).toContain('Documents');
    expect(markup).not.toContain('Videos');
    expect(markup).toContain(`${bytes(9 * GB)} of ${bytes(18 * GB)}`);
  });

  it('draws the scanning bar under the hero on a phone', () => {
    seen.width = 'compact';
    seen.progress = { scan: { done: 4210, total: 12_480 } };
    const markup = html(
      createElement(MyDriveHero, { root: MINE, use: { used: 0, quota: { kind: 'none' } } }),
    );
    expect(markup).toContain('Scanning · 4,210 of 12,480');
    expect(markup).toContain('No limit set');
  });

  it('shows the Shared Drive with the home’s people and no gauge, empty or not', () => {
    seen.owner = true;
    const markup = html(createElement(SharedDriveHero, { root: HOME }));
    expect(markup).toContain('Shared Drive');
    expect(markup).toContain('Everyone in the home can open and edit');
    expect(markup).toContain('2 people in the home');
    expect(markup).toContain('Counts toward no one’s quota');
    expect(markup).toContain('Nothing stored yet');
  });

  it('waits with a placeholder instead of saying nothing is stored while the stats load', () => {
    seen.statsKnown = false;
    const markup = html(
      createElement(MyDriveHero, { root: MINE, use: { used: 0, quota: { kind: 'none' } } }),
    );
    expect(markup).not.toContain('Nothing stored yet');
    expect(markup).toContain('aria-busy');
  });
});
