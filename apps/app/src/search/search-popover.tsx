import type { ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { href } from '../app-shell/hrefs';
import { placeBelow, type Rect } from '../components/anchor';
import { ListRow } from '../components/list-row';
import { SearchField } from '../components/search-field';
import { useValue } from '../design/external-store';
import { modifierLabel } from '../design/platform';
import { blurInlineSearch } from './open-search';
import { closeSearchOverlay, searchOverlay, setOverlayQuery } from './overlay-state';
import { ResultList } from './result-list';
import { useSearchPanel } from './search-panel';

const WIDTH = 560;

const MARGIN = 8;

function anchorOf(anchor: Rect | null, window: { readonly width: number }): Rect {
  if (anchor !== null) {
    return anchor;
  }
  return { x: (window.width - WIDTH) / 2, y: MARGIN * 6, width: 0, height: 0 };
}

function close(): void {
  closeSearchOverlay();
  blurInlineSearch();
}

function seeAll(query: string): void {
  close();
  router.push(href.search(query));
}

function Panel({ query, field }: { readonly query: string; readonly field: boolean }): ReactNode {
  const panel = useSearchPanel({
    query,
    onQuery: setOverlayQuery,
    look: 'popover',
    onDone: close,
    onEscape: () => {
      if (query === '') {
        close();
        return;
      }
      setOverlayQuery('');
    },
    onSeeAll: () => {
      seeAll(query);
    },
  });
  return (
    <>
      {field ? (
        <View className="border-b border-outline-variant p-2">
          <SearchField
            value={query}
            onChange={setOverlayQuery}
            placeholder="Search your home"
            focusOnMount
          />
        </View>
      ) : null}
      <ResultList model={panel.model} contentClassName="py-2" grow={false} />
      {query.trim() === '' ? null : (
        <View className="border-t border-outline-variant">
          <ListRow
            title="See all results"
            icon="search"
            value={`${modifierLabel()} Enter`}
            onPress={() => {
              seeAll(query);
            }}
          />
        </View>
      )}
    </>
  );
}

export function SearchPopover(): ReactNode {
  const overlay = useValue(searchOverlay);
  const window = useWindowDimensions();
  if (!overlay.open) {
    return null;
  }
  const anchor = anchorOf(overlay.anchor, window);
  const width = Math.min(WIDTH, window.width - Math.max(MARGIN, anchor.x) - MARGIN);
  const place = placeBelow(anchor, width, window);
  const frame = {
    left: place.left,
    top: place.top,
    width,
    maxHeight: Math.min(place.maxHeight, window.height * 0.7),
  };
  return (
    <View className="absolute inset-0 z-50" pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close search"
        onPress={close}
        className="absolute inset-0"
      />
      <View
        style={frame}
        accessibilityLabel="Search results"
        className="absolute overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-raised elevation-3"
      >
        <Panel query={overlay.query} field={overlay.field} />
      </View>
    </View>
  );
}
