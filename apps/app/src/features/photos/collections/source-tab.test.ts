import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoSource } from '@smarteverything/domain';
import type { SourceSearch } from '../../../api/photos';
import type { LibraryHeadProps, ShellFrame } from '../library/library-head';
import type { LibrarySearch } from '../search/library-search';
import type { SearchInput } from '../search/query';
import type { SourceActions } from './source-actions';
import type { SourceGridProps } from './source-grid';
import type { SourceTile } from './source-model';
import type { SourceSelectionProps } from './source-selection';
import type { SourceView } from './use-source';

const TILE: SourceTile = {
  id: 'rec-1',
  chipId: 'front-door',
  madeAt: Date.parse('2026-11-07T08:00:00Z'),
  day: '2026-11-07',
  kept: false,
  video: true,
  durationMs: 32_000,
  name: 'front door.mp4',
  mime: 'video/mp4',
  bytes: 4_000_000,
};

interface Seen {
  live: boolean;
  view: SourceView;
  chipAsked: (string | null)[];
  searched: SourceSearch[];
  frame: ShellFrame | null;
  grid: SourceGridProps | null;
  kept: (readonly SourceTile[])[];
}

function viewOf(tiles: readonly SourceTile[], status: SourceView['status'] = 'ready'): SourceView {
  return {
    status,
    error: status === 'error' ? new Error('hub down') : null,
    tiles,
    days: tiles.length === 0 ? [] : [{ day: TILE.day, tiles }],
    chips: [
      { id: 'front-door', name: 'Front door', count: 402 },
      { id: 'garden', name: 'Garden', count: 228 },
    ],
    names: new Map([
      ['front-door', 'Front door'],
      ['garden', 'Garden'],
    ]),
    total: undefined,
    failedMore: false,
    more: () => undefined,
    retry: () => undefined,
  };
}

const seen = vi.hoisted((): Seen => ({
  live: true,
  view: {
    status: 'loading',
    error: null,
    tiles: [],
    days: [],
    chips: [],
    names: new Map(),
    total: undefined,
    failedMore: false,
    more: () => undefined,
    retry: () => undefined,
  },
  chipAsked: [],
  searched: [],
  frame: null,
  grid: null,
  kept: [],
}));

function label(name: string): () => ReactNode {
  return function Stand(): ReactNode {
    return createElement('span', {}, name);
  };
}

vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({ status: seen.live ? 'live' : 'offline' }),
}));
vi.mock('../../../store/clock', () => ({ useDayKey: (): string => '2026-11-07' }));
vi.mock('../../../components/use-escape', () => ({ useEscape: (): void => undefined }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', {}, children),
}));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/button', () => ({
  Button: ({ label: text }: { readonly label: string }): ReactNode =>
    createElement('button', {}, text),
}));
vi.mock('../../../components/flat-choice', () => ({
  FlatChoice: ({
    label: text,
    count,
  }: {
    readonly label: string;
    readonly count: number;
  }): ReactNode => createElement('i', {}, `${text} ${String(count)}`),
}));
vi.mock('../../../components/skeleton', () => ({ Skeleton: label('skeleton') }));
vi.mock('../../../components/error-state', () => ({ ErrorState: label('error') }));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title }: { readonly title: string }): ReactNode =>
    createElement('section', {}, title),
}));
vi.mock('../../../components/banner', () => ({
  Banner: ({ title }: { readonly title: string }): ReactNode => createElement('aside', {}, title),
}));
vi.mock('../../../components/library-frame', () => ({
  ChipRow: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('nav', {}, children),
}));
vi.mock('./use-source', () => ({
  useSource: (_source: PhotoSource, chipId: string | null, search: SourceSearch): SourceView => {
    seen.chipAsked.push(chipId);
    seen.searched.push(search);
    return seen.view;
  },
}));
vi.mock('./source-actions', () => ({
  useSourceActions: (): SourceActions => ({
    busy: false,
    chatHint: null,
    keep: (tiles): void => {
      seen.kept.push(tiles);
    },
    toChat: (): void => undefined,
  }),
}));
vi.mock('./source-grid', () => ({
  SourceGrid: (props: SourceGridProps): ReactNode => {
    seen.grid = props;
    return createElement('div', {}, props.header, props.footer);
  },
}));
vi.mock('../library/library-head', () => ({
  LibraryShell: ({
    frame,
    children,
  }: {
    readonly frame: ShellFrame;
    readonly children: ReactNode;
  }): ReactNode => {
    seen.frame = frame;
    return createElement('main', {}, frame.banner, frame.selection, children);
  },
}));
vi.mock('../search/save-smart-album', () => ({ SaveSmartAlbum: (): null => null }));

const { SourceTab } = await import('./source-tab');
const { SourceSelection } = await import('./source-selection');

const NO_INPUT: SearchInput = { tokens: [], text: '' };

function headOf(input: SearchInput): LibraryHeadProps {
  const noop = (): void => undefined;
  const search: LibrarySearch = {
    state: { tokens: input.tokens, input: input.text, words: input.text },
    input,
    groups: [],
    highlight: 0,
    loading: false,
    offline: false,
    recent: [],
    chips: [],
    open: false,
    act: noop,
    submit: noop,
    key: noop,
    browse: noop,
    close: noop,
    clearRecent: noop,
  };
  return {
    search,
    unused: [],
    chips: [],
    active: 'cameras',
    onTab: noop,
    compact: false,
    zoom: null,
  };
}

function render(source: PhotoSource, input: SearchInput = NO_INPUT): string {
  const search: SourceSearch = {
    text: input.text === '' ? null : input.text,
    from: null,
    to: null,
  };
  return renderToStaticMarkup(createElement(SourceTab, { head: headOf(input), source, search }));
}

function selectionOf(source: PhotoSource, picked: readonly SourceTile[]): string {
  const props: SourceSelectionProps = {
    source,
    picked,
    disabled: false,
    chatHint: null,
    onClear: () => undefined,
    onKeep: () => undefined,
    onChat: () => undefined,
  };
  return renderToStaticMarkup(createElement(SourceSelection, props));
}

describe('Cameras and Made with AI', () => {
  beforeEach(() => {
    seen.live = true;
    seen.view = viewOf([TILE]);
    seen.chipAsked = [];
    seen.searched = [];
    seen.frame = null;
    seen.grid = null;
    seen.kept = [];
  });

  it('shows Cameras with the read-only note, camera chips with counts and the clip count', () => {
    seen.view = { ...viewOf([TILE]), total: 812 };
    const html = render('cameras');
    expect(seen.frame?.subtitle).toBe('812 clips from 2 home cameras');
    expect(seen.frame?.actions.map((action) => action.label)).toEqual(['Select']);
    expect(seen.frame?.selection).toBeNull();
    expect(html).toContain('kept as long as each camera keeps them');
    expect(html).toContain('Open Cameras');
    expect(html).toContain('All cameras 630');
    expect(html).toContain('Front door 402');
    expect(seen.chipAsked).toEqual([null]);
  });

  it('shows Made with AI with its note and no camera chips', () => {
    seen.view = { ...viewOf([TILE]), chips: [], total: 96 };
    const html = render('ai');
    expect(seen.frame?.subtitle).toBe('96 images');
    expect(html).toContain('Images made or sent in your own chats. Only you see them.');
    expect(html).not.toContain('Front door');
  });

  it('gives Cameras To chat and Keep in Drive, and Made with AI only Keep', () => {
    const cameras = selectionOf('cameras', [TILE]);
    expect(cameras).toContain('1 clip selected');
    expect(cameras).toContain('To chat');
    expect(cameras).toContain('Keep in Drive');
    const ai = selectionOf('ai', [{ ...TILE, video: false, mime: 'image/png' }]);
    expect(ai).toContain('1 image selected');
    expect(ai).not.toContain('To chat');
    expect(ai).toContain('Keep');
  });

  it('shows the empty, loading, error and offline states', () => {
    seen.view = viewOf([]);
    expect(render('cameras')).toContain('No camera clips yet');
    expect(seen.frame?.actions).toEqual([]);
    expect(render('ai')).toContain('No images made with AI yet');
    seen.view = viewOf([], 'loading');
    expect(render('cameras')).toContain('skeleton');
    seen.view = viewOf([], 'error');
    expect(render('cameras')).toContain('error');
    seen.view = viewOf([TILE]);
    seen.live = false;
    expect(render('cameras')).toContain('The hub is offline');
  });

  it('narrows the source by the search and offers Clear search with the loaded count', () => {
    const html = render('cameras', { tokens: [], text: 'door' });
    expect(seen.searched).toEqual([{ text: 'door', from: null, to: null }]);
    expect(html).toContain('1 item so far');
    expect(html).toContain('Clear search');
  });

  it('shows the no results card instead of the empty source while searching', () => {
    seen.view = viewOf([]);
    const html = render('ai', { tokens: [], text: 'castle' });
    expect(html).toContain('Nothing matches “castle”');
    expect(html).not.toContain('No images made with AI yet');
  });
});
