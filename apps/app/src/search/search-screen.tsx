import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';
import {
  router,
  useLocalSearchParams,
  useNavigation,
  type NativeStackNavigationProp,
} from 'expo-router';
import Head from 'expo-router/head';
import { ShellGate } from '../app-shell/shell-gate';
import { IconButton } from '../components/icon-button';
import { SearchField } from '../components/search-field';
import { ResultList } from './result-list';
import { useSearchPanel } from './search-panel';

function leave(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/');
}

function useFocusAfterTransition(input: RefObject<TextInput | null>): void {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  useEffect(
    () =>
      navigation.addListener('transitionEnd', () => {
        if (input.current?.isFocused() === false) {
          input.current.focus();
        }
      }),
    [navigation, input],
  );
}

function SearchBody({ initial }: { readonly initial: string }): ReactNode {
  const [query, setQuery] = useState(initial);
  const input = useRef<TextInput>(null);
  useFocusAfterTransition(input);
  const panel = useSearchPanel({
    query,
    onQuery: setQuery,
    look: 'page',
    onDone: leave,
    onEscape: leave,
  });
  return (
    <View className="flex-1 bg-bg">
      <View className="w-full max-w-reading self-center flex-row items-center gap-1 px-1 pt-safe-offset-2 pb-2">
        <IconButton icon="arrowLeft" label="Back" onPress={leave} />
        <View className="flex-1 pr-3">
          <SearchField
            inputRef={input}
            value={query}
            onChange={setQuery}
            {...(panel.submit === null ? {} : { onSubmit: panel.submit })}
            placeholder="Search your home"
            focusOnMount
            variant="bar"
          />
        </View>
      </View>
      <ResultList
        model={panel.model}
        contentClassName="w-full max-w-reading self-center px-gutter pt-2 pb-safe-offset-6"
      />
    </View>
  );
}

export function SearchScreen(): ReactNode {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return (
    <ShellGate>
      <Head>
        <title>Search · SmartEverything</title>
      </Head>
      <SearchBody initial={q ?? ''} />
    </ShellGate>
  );
}
