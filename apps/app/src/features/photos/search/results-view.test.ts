import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import type { MediaActions } from '../timeline/use-media-actions';
import type { SearchPages } from './use-search-pages';

const pressed = vi.hoisted(() => new Map<string, () => void>());

interface ButtonProps {
  readonly label: string;
  readonly onPress?: () => void;
}

interface GridProps {
  readonly tiles: readonly MediaTile[];
  readonly empty: ReactNode;
}

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('div', null, children),
}));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('../../../api/drive', () => ({ createDriveAlbum: vi.fn() }));
vi.mock('../../../app-shell/hrefs', () => ({ href: {} }));
vi.mock('../../../components/button', () => ({
  Button: ({ label, onPress }: ButtonProps): ReactNode => {
    if (onPress !== undefined) pressed.set(label, onPress);
    return createElement('button', null, label);
  },
}));
vi.mock('../../../components/error-state', () => ({ ErrorState: (): ReactNode => null }));
vi.mock('../timeline/timeline-states', () => ({ TimelineLoading: (): ReactNode => null }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('span', null, children),
}));
vi.mock('../../../components/toast-store', () => ({ notifyFailure: vi.fn() }));
vi.mock('../timeline/timeline-grid', () => ({
  TimelineGrid: ({ tiles, empty }: GridProps): ReactNode =>
    tiles.length === 0 ? empty : createElement('ol', null, `${String(tiles.length)} tiles`),
}));
vi.mock('./no-results', () => ({
  NoResults: (): ReactNode => createElement('p', null, 'Nothing matches'),
}));

const { SearchResults } = await import('./results-view');

const TILE: MediaTile = {
  id: 'a',
  rev: 1,
  aspect: 1,
  takenAt: 0,
  offsetMin: 0,
  durationMs: null,
  thumbhash: null,
  flags: 0,
  local: false,
};

const MEDIA: MediaActions = {
  chatHint: null,
  albums: () => [],
  favourite: vi.fn(),
  toChat: vi.fn(),
  share: vi.fn(),
  download: vi.fn(),
  showInDrive: vi.fn(),
  ask: vi.fn(),
  trash: vi.fn(),
};

function pagesOf(tiles: readonly MediaTile[]): SearchPages {
  return {
    state: 'ready',
    error: null,
    failedMore: false,
    tiles,
    ids: tiles.map((tile) => tile.id),
    summary: { photos: tiles.length, videos: 0, bytes: 0, durationMs: 0, complete: true },
    more: vi.fn(),
    retry: vi.fn(),
  };
}

function controlsOf(active: boolean, all: () => void): MediaSelectionControls {
  return {
    selection: { active, ids: new Set(), anchor: null },
    begin: vi.fn(),
    clear: vi.fn(),
    all,
    press: vi.fn(),
    day: vi.fn(),
    dragStart: vi.fn(),
    dragOver: vi.fn(),
    dragEnd: vi.fn(),
  };
}

function render(tiles: readonly MediaTile[], controls: MediaSelectionControls): string {
  pressed.clear();
  return renderToStaticMarkup(
    createElement(SearchResults, {
      search: { tokens: [{ kind: 'favourites', label: 'Favourites' }], text: '' },
      pages: pagesOf(tiles),
      step: 'days',
      onStep: vi.fn(),
      controls,
      media: MEDIA,
      onClearFilters: vi.fn(),
    }),
  );
}

describe('SearchResults', () => {
  it('offers Select all on the results line and selects every result', () => {
    const all = vi.fn();
    const html = render([TILE], controlsOf(false, all));
    expect(html).toContain('1 photo');
    expect(html).toContain('Save as smart album');
    expect(html).toContain('Select all');
    pressed.get('Select all')?.();
    expect(all).toHaveBeenCalledOnce();
  });

  it('hides Select all while selecting, since the selection bar carries it', () => {
    expect(render([TILE], controlsOf(true, vi.fn()))).not.toContain('Select all');
  });

  it('shows Nothing matches without a results line when there are no results', () => {
    const html = render([], controlsOf(false, vi.fn()));
    expect(html).toContain('Nothing matches');
    expect(html).not.toContain('Select all');
  });
});
