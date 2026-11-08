import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ChoiceChip } from '../../../components/choice-chip';
import { FlatChoice } from '../../../components/flat-choice';
import { HScroller } from '../../../components/h-scroller';
import { SearchField } from '../../../components/search-field';
import { count } from '../../../format/number';
import {
  DEFAULT_VIEW,
  SEARCH_FROM,
  SORTS,
  type FilterChoice,
  type View as ListView,
} from './list-view';

const INLINE_FILTER_MIN = 520;
const SORT_OPTIONS = SORTS.map(({ id, label }) => ({ value: id, label }));

export interface FiltersProps {
  readonly choices: readonly FilterChoice[];
  readonly view: ListView;
  readonly total: number;
  readonly onChange: (view: ListView) => void;
}

function StatusFilters({
  choices,
  view,
  onChange,
  narrow,
}: Pick<FiltersProps, 'choices' | 'view' | 'onChange'> & {
  readonly narrow: boolean;
}): ReactNode {
  if (narrow) {
    return (
      <ChoiceChip
        label="Filter automations"
        icon="filter"
        options={choices.map((choice) => ({
          value: choice.id,
          label: `${choice.label} · ${count(choice.count)}`,
        }))}
        value={view.filter}
        all={DEFAULT_VIEW.filter}
        onChange={(filter) => {
          onChange({ ...view, filter });
        }}
      />
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
            active={choice.id === view.filter}
            onPress={() => {
              onChange({ ...view, filter: choice.id });
            }}
          />
        ))}
      </View>
    </HScroller>
  );
}

export function Filters({ choices, view, total, onChange }: FiltersProps): ReactNode {
  const [width, setWidth] = useState(0);
  return (
    <View
      className="gap-2"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
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
      <View className="flex-row items-center gap-1">
        <View className="min-w-0 flex-1">
          <StatusFilters
            choices={choices}
            view={view}
            onChange={onChange}
            narrow={width < INLINE_FILTER_MIN}
          />
        </View>
        <View className="max-w-[45%] min-w-0">
          <ChoiceChip
            label="Sort automations"
            icon="list"
            options={SORT_OPTIONS}
            value={view.sort}
            all={DEFAULT_VIEW.sort}
            onChange={(sort) => {
              onChange({ ...view, sort });
            }}
          />
        </View>
      </View>
    </View>
  );
}
