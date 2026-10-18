import { useEffect, useMemo } from 'react';
import { keyPressOf, type KeyPress } from '../design/keyboard';
import { isNative, useIdiom } from '../design/platform';
import { useDebouncedValue } from '../design/use-debounced-value';
import { useStableCallback } from '../design/use-stable-callback';
import { inlineOf, useSearchActions, type SearchActions } from './actions';
import { useSearchCatalogue, type SearchCatalogue } from './catalogue';
import { useResultNavigation, type ResultNavigation } from './navigation';
import { useRecentSearches } from './recent';
import type { SearchListModel } from './result-list';
import { suggestionRows, treeRows, type Expansion, type SearchRow } from './result-rows';
import type { ResultsLook } from './row-frame';
import { favouritesOf, roomsOf, triesOf } from './suggestions';
import { treeOf } from './tree';

const SETTLE_MS = 120;

interface SearchPanelProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly look: ResultsLook;
  readonly onDone: () => void;
  readonly onEscape: () => void;
  readonly onSeeAll?: () => void;
}

interface Keys {
  readonly navigation: ResultNavigation;
  readonly actions: SearchActions;
  readonly catalogue: SearchCatalogue;
  readonly props: SearchPanelProps;
}

function activate(keys: Keys): boolean {
  const row = keys.navigation.selected;
  switch (row?.kind) {
    case 'node':
      keys.actions.open(row.node);
      return true;
    case 'more':
      keys.navigation.showAll(row.target);
      return true;
    case 'query':
      keys.props.onQuery(row.text);
      return true;
    case 'group':
    case undefined:
      return false;
  }
}

function enter(press: KeyPress, keys: Keys): boolean {
  if (press.command && keys.props.onSeeAll !== undefined) {
    keys.props.onSeeAll();
    return true;
  }
  return activate(keys);
}

function tab(keys: Keys): boolean {
  const row = keys.navigation.selected;
  if (row?.kind !== 'node' || inlineOf(row.node, keys.catalogue) === null) {
    return false;
  }
  keys.actions.inline(row.node);
  return true;
}

function handle(press: KeyPress, keys: Keys): boolean {
  switch (press.key) {
    case 'ArrowDown':
      keys.navigation.move(1);
      return true;
    case 'ArrowUp':
      keys.navigation.move(-1);
      return true;
    case 'ArrowRight':
      return keys.navigation.navigating && keys.navigation.right();
    case 'ArrowLeft':
      return keys.navigation.navigating && keys.navigation.left();
    case 'Enter':
      return enter(press, keys);
    case 'Tab':
      return tab(keys);
    case 'Escape':
      keys.props.onEscape();
      return true;
    default:
      return false;
  }
}

function useCapturedKeys(active: boolean, handler: (press: KeyPress) => boolean): void {
  useEffect(() => {
    if (!active || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (handler(keyPressOf(event))) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', listen, true);
    return (): void => {
      document.removeEventListener('keydown', listen, true);
    };
  }, [active, handler]);
}

function useRowBuilder(
  catalogue: SearchCatalogue,
  query: string,
  recent: readonly string[],
): (expansion: Expansion) => readonly SearchRow[] {
  const branches = useMemo(
    () => (query === '' ? [] : treeOf(catalogue, query)),
    [catalogue, query],
  );
  const suggested = useMemo(
    () =>
      query === ''
        ? suggestionRows({
            recent,
            favourites: favouritesOf(catalogue),
            rooms: roomsOf(catalogue),
            tries: triesOf(catalogue),
          })
        : [],
    [catalogue, recent, query],
  );
  return (expansion) => (query === '' ? suggested : treeRows(branches, expansion));
}

export function useSearchQuery(query: string): string {
  const trimmed = query.trim();
  const settled = useDebouncedValue(trimmed, SETTLE_MS);
  return trimmed === '' ? '' : settled;
}

export function useSettledSearchPanel(
  props: SearchPanelProps,
  query: string,
): {
  readonly model: SearchListModel;
  readonly submit: (() => void) | null;
} {
  const pointer = useIdiom() === 'pointer';
  const catalogue = useSearchCatalogue();
  const { recent, clear } = useRecentSearches();
  const navigation = useResultNavigation(query, useRowBuilder(catalogue, query, recent));
  const actions = useSearchActions(catalogue, query, props.onDone);
  const keys: Keys = { navigation, actions, catalogue, props };
  useCapturedKeys(pointer, (press) => handle(press, keys));
  const onOpen = useStableCallback(actions.open);
  const onToggle = useStableCallback(navigation.toggle);
  const onShowAll = useStableCallback(navigation.showAll);
  const onQuery = useStableCallback(props.onQuery);
  const model: SearchListModel = {
    rows: navigation.rows,
    query,
    catalogue,
    look: props.look,
    selectedKey: navigation.selected?.key ?? null,
    keyboard: pointer,
    navigating: navigation.navigating,
    onOpen,
    onToggle,
    onShowAll,
    onQuery,
    onClearRecent: clear,
  };
  const submit = (): void => {
    activate(keys);
  };
  return { model, submit: pointer ? null : submit };
}

export function useSearchPanel(props: SearchPanelProps): ReturnType<typeof useSettledSearchPanel> {
  return useSettledSearchPanel(props, useSearchQuery(props.query));
}
