import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FlatChoice } from '../../../components/flat-choice';
import { HScroller } from '../../../components/h-scroller';
import { FILTER_LABELS, RUN_FILTERS, type RunFilter } from './run-history-model';

export interface RunFiltersProps {
  readonly chosen: ReadonlySet<RunFilter>;
  readonly counts: Readonly<Record<RunFilter, number>>;
  readonly onToggle: (filter: RunFilter) => void;
}

export function RunFilters({ chosen, counts, onToggle }: RunFiltersProps): ReactNode {
  return (
    <HScroller label="Run filters" fade>
      <View className="flex-row">
        {RUN_FILTERS.map((filter) => (
          <FlatChoice
            key={filter}
            role="checkbox"
            label={FILTER_LABELS[filter]}
            count={counts[filter]}
            active={chosen.has(filter)}
            onPress={() => {
              onToggle(filter);
            }}
          />
        ))}
      </View>
    </HScroller>
  );
}
