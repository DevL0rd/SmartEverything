import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { count as formatCount } from '../../../format/number';
import {
  SEARCH_FROM,
  SORTS,
  type FilterChoice,
  type FilterId,
  type SortId,
  type View as ListView,
} from './list-view';

export interface FiltersProps {
  readonly choices: readonly FilterChoice[];
  readonly view: ListView;
  readonly total: number;
  readonly onChange: (view: ListView) => void;
}

function Chip({
  label,
  count,
  active,
  onPress,
}: {
  readonly label: string;
  readonly count?: number;
  readonly active: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      role="tab"
      label={count === undefined ? label : `${label}, ${formatCount(count)}`}
      selected={active}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center gap-1.5 rounded-full border-hairline px-3',
        active ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
      layerClassName="rounded-full"
    >
      <Text variant="label" tone={active ? 'primary' : 'default'} numberOfLines={1}>
        {label}
      </Text>
      {count === undefined ? null : (
        <Text variant="label" tone="variant" className="tabular">
          {formatCount(count)}
        </Text>
      )}
    </Interactive>
  );
}

function SortRow({
  sort,
  onPick,
}: {
  readonly sort: SortId;
  readonly onPick: (sort: SortId) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="caption" tone="variant">
        Sort
      </Text>
      {SORTS.map((option) => (
        <Chip
          key={option.id}
          label={option.label}
          active={option.id === sort}
          onPress={() => {
            onPick(option.id);
          }}
        />
      ))}
    </View>
  );
}

export function Filters({ choices, view, total, onChange }: FiltersProps): ReactNode {
  const pick = (filter: FilterId): void => {
    onChange({ ...view, filter });
  };
  return (
    <View className="gap-2">
      {total >= SEARCH_FROM ? (
        <SearchField
          value={view.query}
          onChange={(query) => {
            onChange({ ...view, query });
          }}
          placeholder="Find an automation"
          variant="field"
        />
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {choices.map((choice) => (
          <Chip
            key={choice.id}
            label={choice.label}
            count={choice.count}
            active={choice.id === view.filter}
            onPress={() => {
              pick(choice.id);
            }}
          />
        ))}
      </ScrollView>
      <SortRow
        sort={view.sort}
        onPick={(sort) => {
          onChange({ ...view, sort });
        }}
      />
    </View>
  );
}
