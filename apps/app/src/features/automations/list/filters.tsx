import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ChoiceChip } from '../../../components/choice-chip';
import { FlatChoice } from '../../../components/flat-choice';
import { HScroller } from '../../../components/h-scroller';
import { count } from '../../../format/number';
import { DEFAULT_VIEW, SORTS, type FilterChoice, type FilterId, type SortId } from './list-view';

const INLINE_FILTER_MIN = 520;
const SORT_OPTIONS = SORTS.map(({ id, label }) => ({ value: id, label }));

export interface FiltersProps {
  readonly choices: readonly FilterChoice[];
  readonly filter: FilterId;
  readonly sort: SortId;
  readonly onFilter: (filter: FilterId) => void;
  readonly onSort: (sort: SortId) => void;
}

function StatusFilters({
  choices,
  filter,
  onFilter,
  narrow,
}: Pick<FiltersProps, 'choices' | 'filter' | 'onFilter'> & {
  readonly narrow: boolean;
}): ReactNode {
  if (narrow) {
    return (
      <View className="flex-row">
        <ChoiceChip
          label="Filter automations"
          icon="filter"
          options={choices.map((choice) => ({
            value: choice.id,
            label: `${choice.label} · ${count(choice.count)}`,
          }))}
          value={filter}
          all={DEFAULT_VIEW.filter}
          onChange={onFilter}
        />
      </View>
    );
  }
  return (
    <HScroller label="Automation filters" fade>
      <View
        className="flex-row"
        accessibilityRole="radiogroup"
        accessibilityLabel="Filter automations"
      >
        {choices.map((choice) => (
          <FlatChoice
            key={choice.id}
            role="radio"
            label={choice.label}
            count={choice.count}
            active={choice.id === filter}
            value={choice.id}
            onSelect={onFilter}
          />
        ))}
      </View>
    </HScroller>
  );
}

export function Filters({ choices, filter, sort, onFilter, onSort }: FiltersProps): ReactNode {
  const [width, setWidth] = useState(0);
  return (
    <View
      className="flex-row items-center gap-1"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <View className="min-w-0 flex-1">
        <StatusFilters
          choices={choices}
          filter={filter}
          onFilter={onFilter}
          narrow={width < INLINE_FILTER_MIN}
        />
      </View>
      <View className="max-w-1/2 min-w-0">
        <ChoiceChip
          label="Sort automations"
          icon="list"
          options={SORT_OPTIONS}
          value={sort}
          all={DEFAULT_VIEW.sort}
          onChange={onSort}
        />
      </View>
    </View>
  );
}
