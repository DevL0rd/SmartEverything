import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import type { FileSearch } from '../data/computer-files';

export function SearchBar({
  value,
  onChange,
  search,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly search: FileSearch | null;
}): ReactNode {
  return (
    <View className="gap-1">
      <SearchField
        value={value}
        onChange={onChange}
        placeholder="Search in this folder"
        variant="field"
        focusOnMount
      />
      {search === null || value.trim() === '' ? null : (
        <View className="min-h-9 flex-row items-center gap-2">
          <Text variant="footnote" tone="variant" className="tabular">
            {search.running
              ? `Searching… ${count(search.matches.length)} found`
              : `${count(search.matches.length)} found`}
          </Text>
          {search.running ? <Button label="Stop" variant="text" onPress={search.stop} /> : null}
        </View>
      )}
    </View>
  );
}
