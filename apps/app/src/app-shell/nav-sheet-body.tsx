import type { ReactElement, ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { View, type TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { SearchField } from '../components/search-field';
import { useValue } from '../design/external-store';
import { useIdiom } from '../design/platform';
import { useSearchQuery } from '../search/search-panel';
import { NavDirectory } from './nav-directory';
import { useListDismiss, useNavSheetPan, type ListDismiss } from './nav-sheet-gesture';
import { NavSheetSearch, type NavSheetSearchHandle } from './nav-sheet-search';
import {
  expandNavSheet,
  navSheetFocus,
  navSheetPhase,
  navSheetQuery,
  type NavSheetPhase,
  type NavSheetStops,
} from './nav-sheet-state';

function useFieldFocus(input: RefObject<TextInput | null>, phase: NavSheetPhase): void {
  const pending = useValue(navSheetFocus);
  useEffect(() => {
    if (pending) {
      input.current?.focus();
      navSheetFocus.set(false);
    }
  }, [pending, input]);
  useEffect(() => {
    if (phase !== 'full') {
      input.current?.blur();
    }
  }, [phase, input]);
}

function Grabber(): ReactNode {
  return (
    <View className="items-center py-3">
      <View className="h-1 w-8 rounded-full bg-on-surface-faint" />
    </View>
  );
}

interface SheetContentProps {
  readonly query: string;
  readonly settled: string;
  readonly search: RefObject<NavSheetSearchHandle | null>;
  readonly onScroll: ListDismiss['onScroll'];
  readonly spacer: ReactElement;
}

function SheetContent({ query, settled, search, onScroll, spacer }: SheetContentProps): ReactNode {
  if (query !== '') {
    return (
      <NavSheetSearch
        query={query}
        settled={settled}
        ref={search}
        onScroll={onScroll}
        spacer={spacer}
      />
    );
  }
  return (
    <Animated.ScrollView
      className="flex-1"
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerClassName="px-4 pb-safe-offset-6"
    >
      <NavDirectory compact />
      {spacer}
    </Animated.ScrollView>
  );
}

export function NavSheetBody({ stops }: { readonly stops: NavSheetStops }): ReactNode {
  const query = useValue(navSheetQuery);
  const settled = useSearchQuery(query);
  const phase = useValue(navSheetPhase);
  const input = useRef<TextInput>(null);
  const search = useRef<NavSheetSearchHandle>(null);
  const pointer = useIdiom() === 'pointer';
  const pan = useNavSheetPan('sheet');
  const list = useListDismiss();
  const hidden = { height: phase === 'open' ? stops.full - stops.half : 0 };
  useFieldFocus(input, phase);
  return (
    <>
      <GestureDetector gesture={pan}>
        <View className="px-4 pb-3">
          <Grabber />
          <SearchField
            inputRef={input}
            value={query}
            onChange={navSheetQuery.set}
            onFocus={expandNavSheet}
            {...(pointer ? {} : { onSubmit: () => search.current?.submit?.() })}
            placeholder="Search your home"
            variant="bar"
          />
        </View>
      </GestureDetector>
      <GestureDetector gesture={list.gesture}>
        <SheetContent
          query={query}
          settled={settled}
          search={search}
          onScroll={list.onScroll}
          spacer={<View style={hidden} />}
        />
      </GestureDetector>
    </>
  );
}
