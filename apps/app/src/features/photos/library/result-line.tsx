import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import type { SearchInput } from '../search/query';
import { SaveSmartAlbum } from '../search/save-smart-album';

export function ResultLine({
  text,
  search,
  onClear,
}: {
  readonly text: string | null;
  readonly search: SearchInput | null;
  readonly onClear: () => void;
}): ReactNode {
  return (
    <View className="min-h-11 flex-row flex-wrap items-center gap-x-3 gap-y-1 px-gutter">
      {text === null ? null : (
        <Text variant="body-strong" className="tabular-nums" numberOfLines={1}>
          {text}
        </Text>
      )}
      <View className="flex-1" />
      {search === null ? null : <SaveSmartAlbum search={search} />}
      <Button label="Clear search" icon="close" variant="text" onPress={onClear} />
    </View>
  );
}
