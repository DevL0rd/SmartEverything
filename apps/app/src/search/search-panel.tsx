import { useEffect, useMemo, type ReactElement } from 'react';
import { useIsFocused } from 'expo-router';
import type { NavPinTarget } from '@smarteverything/domain';
import { keyPressOf, type KeyPress } from '../design/keyboard';
import { isNative, useIdiom } from '../design/platform';
import { useDebouncedValue } from '../design/use-debounced-value';
import { useStableCallback } from '../design/use-stable-callback';
import { inlineOf, useSearchActions, type SearchActions } from './actions';
import { useSearchCatalogue, type SearchCatalogue } from './catalogue';
import { DriveResults } from './drive-results';
import { useResultNavigation, type ResultNavigation } from './navigation';
import { useRecentSearches } from './recent';
import type { SearchListModel } from './result-list';
import { suggestionRows, treeRows, type Expansion, type SearchRow } from './result-rows';
import type { ResultsLook } from './row-frame';
import { handleSearchKey } from './search-keys';
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
  readonly pick?: (target: NavPinTarget) => void;
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

function runInline(keys: Keys): boolean {
  const row = keys.navigation.selected;
  if (
    keys.props.pick !== undefined ||
    row?.kind !== 'node' ||
    inlineOf(row.node, keys.catalogue) === null
  ) {
    return false;
  }
  keys.actions.inline(row.node);
  return true;
}

function pinSelected(keys: Keys): boolean {
  const row = keys.navigation.selected;
  return row?.kind === 'node' && keys.actions.pin(row.node);
}

function useCapturedKeys(active: boolean, handler: (press: KeyPress) => boolean): void {
  useEffect(() => {
    if (!active || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (!event.defaultPrevented && !event.isComposing && handler(keyPressOf(event))) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', listen, true);
    return (): void => {
      document.removeEventListener('keydown', listen, true);
    };
  }, [active, handler]);
}

function useSearchKeys(pointer: boolean, settled: boolean, keys: Keys): void {
  const focused = useIsFocused();
  const { navigation, props } = keys;
  const handle = useStableCallback((press: KeyPress) =>
    handleSearchKey(press, settled, {
      open: () => activate(keys),
      runInline: () => runInline(keys),
      close: props.onEscape,
      seeAll: props.onSeeAll,
      pin: () => pinSelected(keys),
      step: navigation.move,
      right: () => navigation.navigating && navigation.right(),
      left: () => navigation.navigating && navigation.left(),
    }),
  );
  useCapturedKeys(pointer && focused, handle);
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
  readonly drive: ReactElement | null;
} {
  const pointer = useIdiom() === 'pointer';
  const catalogue = useSearchCatalogue();
  const { recent, clear } = useRecentSearches();
  const navigation = useResultNavigation(query, useRowBuilder(catalogue, query, recent));
  const actions = useSearchActions(catalogue, query, props.onDone, props.pick ?? null);
  const keys: Keys = { navigation, actions, catalogue, props };
  const settled = query === props.query.trim();
  useSearchKeys(pointer, settled, keys);
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
    picking: props.pick !== undefined,
    onOpen,
    onToggle,
    onShowAll,
    onQuery,
    onClearRecent: clear,
  };
  const submit = (): void => {
    if (settled) {
      activate(keys);
    }
  };
  const drive =
    query === '' || props.pick !== undefined ? null : (
      <DriveResults query={query} look={props.look} onDone={props.onDone} />
    );
  return { model, submit: pointer ? null : submit, drive };
}

export function useSearchPanel(props: SearchPanelProps): ReturnType<typeof useSettledSearchPanel> {
  return useSettledSearchPanel(props, useSearchQuery(props.query));
}
