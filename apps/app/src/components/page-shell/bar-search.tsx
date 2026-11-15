import { useEffect, useState, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';
import { keyPressOf } from '../../design/keyboard';
import { isNative, useIdiom } from '../../design/platform';
import { useSizeClass } from '../../design/size-class';
import { IconButton } from '../icon-button';
import { SEARCH_WIDTH } from './layout';
import {
  ShellSearch,
  searchOptionsPlaceOf,
  searchShortcutOf,
  type SearchOptionsPlace,
  type ShellSearchConfig,
} from './search-slot';

const TITLE_MIN = 160;

const ROW_GAP = 16;

const INLINE_STYLE: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: SEARCH_WIDTH.min,
  minWidth: SEARCH_WIDTH.min,
  maxWidth: SEARCH_WIDTH.max,
};

export function searchInlineAt(bar: number, trailing: number): boolean {
  return bar >= TITLE_MIN + SEARCH_WIDTH.min + trailing + ROW_GAP * 2;
}

export function useSearchOptionsPlace(): SearchOptionsPlace {
  return searchOptionsPlaceOf(useIdiom() === 'pointer', useSizeClass().width === 'compact');
}

export function barOptionsOf(
  search: ShellSearchConfig | undefined,
  place: SearchOptionsPlace,
): ReactNode {
  return search === undefined || place === 'inside' ? undefined : search.options;
}

function inBar(search: ShellSearchConfig, place: SearchOptionsPlace): ShellSearchConfig {
  if (place === 'inside') return search;
  const { options, ...rest } = search;
  return options === undefined ? search : rest;
}

export type BarSearchMode = 'none' | 'inline' | 'icon' | 'open';

export interface BarSearch {
  readonly mode: BarSearchMode;
  readonly onBar: (width: number) => void;
  readonly onTrailing: (width: number) => void;
  readonly open: () => void;
  readonly close: () => void;
}

export function useBarSearch(search: ShellSearchConfig | undefined): BarSearch {
  const [bar, setBar] = useState<number | null>(null);
  const [trailing, setTrailing] = useState(0);
  const [opened, setOpened] = useState(false);
  const modeOf = (): BarSearchMode => {
    if (search === undefined) return 'none';
    if (bar !== null && searchInlineAt(bar, trailing)) return 'inline';
    return opened || search.value !== '' ? 'open' : 'icon';
  };
  return {
    mode: modeOf(),
    onBar: setBar,
    onTrailing: setTrailing,
    open: (): void => {
      setOpened(true);
    },
    close: (): void => {
      search?.onChange('');
      setOpened(false);
    },
  };
}

function InlineSearch({ search }: { readonly search: ShellSearchConfig }): ReactNode {
  const place = useSearchOptionsPlace();
  return (
    <View testID="shell-search" style={INLINE_STYLE}>
      <ShellSearch search={inBar(search, place)} />
    </View>
  );
}

function useOpenShortcut(onOpen: () => void): void {
  const pointer = useIdiom() === 'pointer';
  const focused = useIsFocused();
  useEffect(() => {
    if (!pointer || !focused || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !searchShortcutOf(keyPressOf(event))) return;
      event.preventDefault();
      onOpen();
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [pointer, focused, onOpen]);
}

function SearchToggle({
  search,
  onOpen,
}: {
  readonly search: ShellSearchConfig;
  readonly onOpen: () => void;
}): ReactNode {
  useOpenShortcut(onOpen);
  return (
    <View testID="shell-search-toggle">
      <IconButton icon="search" label={search.label ?? search.placeholder} onPress={onOpen} />
    </View>
  );
}

export function OpenSearch({
  search,
  onClose,
}: {
  readonly search: ShellSearchConfig;
  readonly onClose: () => void;
}): ReactNode {
  const place = useSearchOptionsPlace();
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1">
      <IconButton icon="arrowLeft" label="Close search" onPress={onClose} />
      <View testID="shell-search" className="min-w-0 flex-1">
        <ShellSearch search={{ ...inBar(search, place), focusOnMount: true }} />
      </View>
    </View>
  );
}

export function BarInline({
  search,
  bar,
}: {
  readonly search: ShellSearchConfig | undefined;
  readonly bar: BarSearch;
}): ReactNode {
  return search !== undefined && bar.mode === 'inline' ? <InlineSearch search={search} /> : null;
}

export function BarTrailing({
  search,
  bar,
  wide = false,
  children,
}: {
  readonly search: ShellSearchConfig | undefined;
  readonly bar: BarSearch;
  readonly wide?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={
        wide ? 'shrink-0 flex-row items-center gap-4' : 'shrink-0 flex-row items-center gap-1'
      }
      onLayout={(event) => {
        bar.onTrailing(event.nativeEvent.layout.width);
      }}
    >
      {search !== undefined && bar.mode === 'icon' ? (
        <SearchToggle search={search} onOpen={bar.open} />
      ) : null}
      {children}
    </View>
  );
}
