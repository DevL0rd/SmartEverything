import { act, createElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoGroup, PhotoPeople } from '@smarteverything/domain';
import type { PeopleRow } from './people-rows';

interface ListSeen {
  rows: readonly PeopleRow[];
  render: ((row: PeopleRow) => ReactElement) | null;
  avatars: number;
}

const seen = vi.hoisted((): ListSeen => ({ rows: [], render: null, avatars: 0 }));

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): unknown => ({ width: 1336, onLayout: (): void => undefined }),
}));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): unknown => ({ width: 'expanded', idiom: 'pointer' }),
}));
vi.mock('../../../design/theme', () => ({ useThemeSetting: (): string => 'regular' }));
vi.mock('../../../design/tokens', () => ({ gutterOf: (): number => 16 }));
vi.mock('./face-avatar', () => ({
  FaceAvatar: (): null => {
    seen.avatars += 1;
    return null;
  },
}));
vi.mock('./people-parts', async () => {
  const { createElement: element, Fragment } = await import('react');
  const { FaceAvatar } = await import('./face-avatar');
  return {
    PeopleHeader: (): null => null,
    SectionTitle: (): null => null,
    SpeciesChips: (): null => null,
    MergeCard: (): ReactElement =>
      element(Fragment, null, element(FaceAvatar), element(FaceAvatar)),
  };
});
vi.mock('./group-tile', async () => {
  const { createElement: element, Fragment } = await import('react');
  const { FaceAvatar } = await import('./face-avatar');
  return {
    GroupRow: ({ groups }: { readonly groups: readonly PhotoGroup[] }): ReactElement =>
      element(
        Fragment,
        null,
        groups.map((group) =>
          element(FaceAvatar, {
            key: group.id,
            itemId: group.coverItemId,
            box: null,
            kind: group.kind,
            size: 48,
          }),
        ),
      ),
  };
});
vi.mock('../../../components/virtual-list', () => ({
  VirtualList: (props: {
    readonly sections: readonly { readonly data: readonly PeopleRow[] }[];
    readonly renderItem: (row: PeopleRow) => ReactElement;
    readonly header: ReactElement;
  }): ReactNode => {
    seen.rows = props.sections.flatMap((section) => section.data);
    seen.render = props.renderItem;
    return props.header;
  },
}));

function group(index: number, count: number): PhotoGroup {
  const id = `g${String(index)}`;
  return {
    id,
    kind: 'person',
    name: count > 1 ? `Person ${String(index)}` : null,
    species: null,
    linkedProfileId: null,
    coverFaceId: `${id}-face`,
    coverItemId: `${id}-item`,
    coverBox: { x: 0, y: 0, w: 0.5, h: 0.5 },
    hidden: false,
    count,
    updatedAt: '2026-11-21T10:00:00.000Z',
  };
}

const GROUPS = Array.from({ length: 218 }, (_, index) => group(index, index % 3 === 0 ? 1 : 5));

const PEOPLE: PhotoPeople = {
  groups: GROUPS,
  mergeSuggestions: Array.from({ length: 190 }, (_, index) => ({
    groupIds: [`g${String(index)}`, `g${String(index + 1)}`] as const,
    similarity: 0.9,
  })),
};

let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  seen.rows = [];
  seen.render = null;
  seen.avatars = 0;
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

async function show(): Promise<void> {
  const { PeopleList } = await import('./people-list');
  act(() => {
    root.render(
      createElement(PeopleList, {
        people: PEOPLE,
        status: undefined,
        live: true,
        size: 112,
        species: null,
        onSpecies: (): void => undefined,
      }),
    );
  });
}

describe('people list windowing', () => {
  it('mounts no face avatar outside the rows the list chooses to draw', async () => {
    await show();
    expect(seen.avatars).toBe(0);
  });

  it('hands every suggestion and every group to the list exactly once', async () => {
    await show();
    const pairs = seen.rows.flatMap((row) => (row.kind === 'merge' ? row.pairs : []));
    const tiles = seen.rows.flatMap((row) => (row.kind === 'tiles' ? row.groups : []));
    expect(pairs).toHaveLength(190);
    expect(new Set(tiles.map((tile) => tile.id)).size).toBe(218);
    expect(tiles).toHaveLength(218);
  });

  it('mounts only the avatars of the rows that are drawn', async () => {
    await show();
    const render = seen.render;
    if (render === null) throw new Error('the list was not given a renderer');
    const merge = seen.rows.find((row) => row.kind === 'merge');
    const tiles = seen.rows.find((row) => row.kind === 'tiles');
    if (merge?.kind !== 'merge' || tiles?.kind !== 'tiles') throw new Error('rows are missing');
    act(() => {
      root.render(createElement(Fragment, null, render(merge), render(tiles)));
    });
    expect(seen.avatars).toBe(merge.pairs.length * 2 + tiles.groups.length);
    expect(seen.avatars).toBeLessThan(20);
  });
});
