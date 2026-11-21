import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveRoot, DriveSuggestion } from '@smarteverything/domain';

const SUGGESTIONS = 200;
const WINDOW = 5;

interface Seen {
  cards: number;
  list: { horizontal: boolean; data: number; mounted: number } | null;
  roots: readonly DriveRoot[];
  wake: (() => void) | null;
}

const seen = vi.hoisted((): Seen => ({
  cards: 0,
  list: null,
  roots: [],
  wake: null,
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));

vi.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    horizontal,
    renderItem,
  }: {
    readonly data: readonly unknown[];
    readonly horizontal?: boolean;
    readonly renderItem: (info: { item: unknown; index: number }) => ReactNode;
  }): ReactNode => {
    const shown = data.slice(0, WINDOW);
    seen.list = { horizontal: horizontal === true, data: data.length, mounted: shown.length };
    return shown.map((item, index) => renderItem({ item, index }));
  },
}));

vi.mock('../../../components/interactive', () => ({
  Interactive: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));
vi.mock('../../../components/error-state', () => ({ ErrorState: (): null => null }));
vi.mock('../../../components/section', () => ({
  Section: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
  SectionAction: (): null => null,
}));
vi.mock('../components/drive-thumb', () => ({ DriveThumb: (): null => null }));
vi.mock('../components/folder-glyph', () => ({
  DriveGlyph: (): null => {
    seen.cards += 1;
    return null;
  },
}));
vi.mock('../../../store/people', () => ({
  useProfiles: (): readonly unknown[] => [],
  useActiveProfile: (): null => null,
}));
vi.mock('../data', async () => {
  const { useSyncExternalStore } = await import('react');
  const { documentFixture, ROOT_ID } = await import('../data/fixtures');
  const items: DriveSuggestion[] = Array.from({ length: SUGGESTIONS }, (_, n) => ({
    item: documentFixture({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      name: `File ${String(n)}`,
      rootId: ROOT_ID,
    }),
    reason: 'opened',
    at: '2026-11-14T08:00:00.000Z',
  }));
  const data = { pages: [{ items, next: null }], pageParams: [null] };
  return {
    useDriveSuggested: (): Record<string, unknown> => ({
      data,
      isError: false,
      error: null,
      refetch: vi.fn(),
    }),
    flattenPages: (
      value: typeof data,
      pick: (page: (typeof data.pages)[number]) => readonly unknown[],
    ): readonly unknown[] => value.pages.flatMap(pick),
    useDriveRootPlaces: (): readonly DriveRoot[] =>
      useSyncExternalStore(
        (wake) => {
          seen.wake = wake;
          return (): void => {
            seen.wake = null;
          };
        },
        () => seen.roots,
      ),
  };
});

const { SuggestedRow } = await import('./suggested-row');
const { rootRow, ROOT_ID } = await import('../data/fixtures');

let root: Root | null = null;

function mount(element: ReactElement): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const mounted = root;
  act(() => {
    mounted.render(element);
  });
}

function tickRoots(): void {
  act(() => {
    seen.roots = [rootRow(ROOT_ID, 'ready')];
    seen.wake?.();
  });
}

beforeEach(() => {
  seen.cards = 0;
  seen.list = null;
  seen.roots = [rootRow(ROOT_ID, 'ready')];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('the Suggested strip on the Drive home', () => {
  it('hands every suggestion to a horizontal virtual list and mounts only the cards it shows', () => {
    mount(createElement(SuggestedRow, { rootId: null }));
    expect(seen.list).toEqual({ horizontal: true, data: SUGGESTIONS, mounted: WINDOW });
    expect(seen.cards).toBe(WINDOW);
  });

  it('keeps every card as it is when the drive roots change without changing a card', () => {
    mount(createElement(SuggestedRow, { rootId: null }));
    const first = seen.cards;
    tickRoots();
    tickRoots();
    tickRoots();
    expect(seen.cards).toBe(first);
  });
});
