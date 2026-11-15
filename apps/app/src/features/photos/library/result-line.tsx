import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import type { SearchInput } from '../search/query';
import { SaveSmartAlbum } from '../search/save-smart-album';

export function ResultLine({
  text,
  matched = null,
  search,
  onClear,
}: {
  readonly text: string | null;
  readonly matched?: string | null;
  readonly search: SearchInput | null;
  readonly onClear: () => void;
}): ReactNode {
  return (
    <View className="min-h-11 flex-row items-center gap-3 px-gutter">
      <View className="min-w-40 flex-1 gap-0.5">
        {text === null ? null : (
          <Text variant="body-strong" className="tabular-nums" numberOfLines={1}>
            {text}
          </Text>
        )}
        {matched === null ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {matched}
          </Text>
        )}
      </View>
      <View className="min-w-0 shrink flex-row flex-wrap items-center justify-end gap-x-1">
        {search === null ? null : <SaveSmartAlbum search={search} />}
        <Button label="Clear search" icon="close" variant="text" onPress={onClear} />
      </View>
    </View>
  );
}
