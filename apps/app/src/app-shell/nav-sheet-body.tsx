import type { ReactElement, ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { View, type TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { SearchField } from '../components/search-field';
import { useValue } from '../design/external-store';
import { ResultList, type SearchListModel } from '../search/result-list';
import { useSearchPanel } from '../search/search-panel';
import { NavDirectory } from './nav-directory';
import { useListDismiss, useNavSheetPan, type ListDismiss } from './nav-sheet-gesture';
import {
  closeNavSheet,
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
  readonly model: SearchListModel;
  readonly onScroll: ListDismiss['onScroll'];
  readonly spacer: ReactElement;
}

function SheetContent({ query, model, onScroll, spacer }: SheetContentProps): ReactNode {
  if (query !== '') {
    return (
      <ResultList
        model={model}
        onScroll={onScroll}
        contentClassName="px-4 pb-safe-offset-6"
        footer={spacer}
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
  const phase = useValue(navSheetPhase);
  const input = useRef<TextInput>(null);
  const pan = useNavSheetPan('sheet');
  const list = useListDismiss();
  const hidden = { height: phase === 'open' ? stops.full - stops.half : 0 };
  useFieldFocus(input, phase);
  const panel = useSearchPanel({
    query,
    onQuery: navSheetQuery.set,
    look: 'page',
    onDone: closeNavSheet,
    onEscape: closeNavSheet,
  });
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
            {...(panel.submit === null ? {} : { onSubmit: panel.submit })}
            placeholder="Search your home"
            variant="bar"
          />
        </View>
      </GestureDetector>
      <GestureDetector gesture={list.gesture}>
        <SheetContent
          query={query}
          model={panel.model}
          onScroll={list.onScroll}
          spacer={<View style={hidden} />}
        />
      </GestureDetector>
    </>
  );
}
