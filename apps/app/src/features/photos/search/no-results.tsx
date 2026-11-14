import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { openSearch } from '../../../search/open-search';
import type { SearchInput } from './query';
import { searchTitleOf } from './tokens';

export function noResultsTitleOf(search: SearchInput): string {
  return `Nothing matches “${searchTitleOf(search.tokens, search.text)}”`;
}

export function wholeAppQueryOf(search: SearchInput): string {
  return [...search.tokens.map((token) => token.label), search.text.trim()]
    .filter((part) => part !== '')
    .join(' ');
}

export function noResultsBodyOf(search: SearchInput): string {
  return search.tokens.length > 0
    ? 'Try fewer filters or other words, or search the whole app for files and chats.'
    : 'Try other words, or search the whole app for files and chats.';
}

export function NoResults({
  search,
  onRemoveLast,
}: {
  readonly search: SearchInput;
  readonly onRemoveLast: () => void;
}): ReactNode {
  return (
    <View className="px-gutter py-6">
      <EmptyState
        icon="search"
        title={noResultsTitleOf(search)}
        body={noResultsBodyOf(search)}
        action={
          <View className="flex-row flex-wrap justify-center gap-2">
            {search.tokens.length > 0 ? (
              <Button label="Remove last filter" variant="tonal" onPress={onRemoveLast} />
            ) : null}
            <Button
              label="Search the whole app"
              icon="search"
              variant={search.tokens.length > 0 ? 'text' : 'tonal'}
              onPress={() => {
                openSearch(wholeAppQueryOf(search));
              }}
            />
          </View>
        }
      />
    </View>
  );
}
