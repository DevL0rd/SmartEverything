import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { useLocalSearchParams, useNavigation, type NativeStackNavigationProp } from 'expo-router';
import { closeFlow } from '../app-shell/close-flow';
import { ShellGate } from '../app-shell/shell-gate';
import { PageShell } from '../components/page-shell/page-shell';
import { ResultList } from './result-list';
import { useSearchPanel } from './search-panel';

function leave(): void {
  closeFlow('/');
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
    <PageShell
      title="Search"
      scroll={false}
      search={{
        value: query,
        onChange: setQuery,
        placeholder: 'Search your home',
        inputRef: input,
        focusOnMount: true,
        ...(panel.submit === null ? {} : { onSubmit: panel.submit }),
      }}
    >
      <ResultList
        model={panel.model}
        contentClassName="pt-2 pb-safe-offset-6"
        fullPage
        footer={panel.content ?? undefined}
      />
    </PageShell>
  );
}

export function SearchScreen(): ReactNode {
  const { q } = useLocalSearchParams<{ q?: string }>();
  return (
    <ShellGate>
      <SearchBody initial={q ?? ''} />
    </ShellGate>
  );
}
