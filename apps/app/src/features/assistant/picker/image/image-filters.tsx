import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Button } from '../../../../components/button';
import { Select, type SelectOption } from '../../../../components/select';
import { Group } from '../library/library-filters';
import { LibraryChip } from '../library/library-chip';
import { NO_IMAGE_FILTERS, type ImageFilters } from './image-rows';

export interface ImageFiltersProps {
  readonly filters: ImageFilters;
  readonly makers: readonly SelectOption<string>[];
  readonly onChange: (filters: ImageFilters) => void;
}

export function ImageFiltersColumn({ filters, makers, onChange }: ImageFiltersProps): ReactNode {
  return (
    <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled">
      <Group title="Maker">
        <Select
          label="Maker"
          showLabel={false}
          searchable
          options={makers}
          value={filters.maker}
          onChange={(maker): void => {
            onChange({ ...filters, maker });
          }}
        />
      </Group>
      <Group title="Capabilities">
        <View className="flex-row flex-wrap gap-2">
          <LibraryChip
            label="Reference images"
            active={filters.references}
            onPress={(): void => {
              onChange({ ...filters, references: !filters.references });
            }}
          />
          <LibraryChip
            label="Live preview"
            active={filters.preview}
            onPress={(): void => {
              onChange({ ...filters, preview: !filters.preview });
            }}
          />
        </View>
      </Group>
      <View className="flex-row p-3">
        <Button
          label="Reset filters"
          variant="outlined"
          grow
          onPress={(): void => {
            onChange(NO_IMAGE_FILTERS);
          }}
        />
      </View>
    </ScrollView>
  );
}
